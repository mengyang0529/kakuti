param(
  [string]$Command,
  [string[]]$Args
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $Command) {
  Write-Host "Usage: powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 <command> [options]"
  Write-Host "Commands: setup, start, stop, status, frontend, backend"
  return
}

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackendDir = Join-Path $RootDir 'backend'
$WebDir = Join-Path $RootDir 'web'
$PidBackend = Join-Path $RootDir 'backend_uvicorn.pid'
$LogBackend = Join-Path $RootDir 'backend_uvicorn.log'
$PidWeb = Join-Path $RootDir 'web_vite.pid'
$LogWeb = Join-Path $RootDir 'web_vite.log'

$script:EnvName = 'kakuti'
$script:PyVersion = '3.11'
$script:WithOcr = $false
$script:Port = 8001
$script:CondaRoot = if ($env:MINICONDA_HOME) { $env:MINICONDA_HOME } else { Join-Path $env:USERPROFILE 'miniconda3' }

function Show-Usage {
  Write-Host "dev.ps1 — Windows setup and dev runner" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Usage:"; Write-Host "  powershell -File scripts/dev.ps1 setup [--env <name>] [--ocr]"
  Write-Host "  powershell -File scripts/dev.ps1 start [--env <name>] [--port <8001>]"
  Write-Host "  powershell -File scripts/dev.ps1 stop"
  Write-Host "  powershell -File scripts/dev.ps1 status"
  Write-Host "  powershell -File scripts/dev.ps1 frontend"
  Write-Host "  powershell -File scripts/dev.ps1 backend [--env <name>] [--port <8001>]"
}

function Parse-CommonFlags {
  param([string[]]$Input)
  $remaining = @()
  for ($i = 0; $i -lt $Input.Count; $i++) {
    switch ($Input[$i]) {
      '--env' {
        if ($i + 1 -ge $Input.Count) { throw "--env requires a value" }
        $script:EnvName = $Input[$i + 1]
        $i++
      }
      '--ocr' { $script:WithOcr = $true }
      '--port' {
        if ($i + 1 -ge $Input.Count) { throw "--port requires a value" }
        $script:Port = [int]$Input[$i + 1]
        $i++
      }
      '-h' { Show-Usage; exit }
      '--help' { Show-Usage; exit }
      default { $remaining += $Input[$i] }
    }
  }
  return ,$remaining
}

function Install-Conda {
  Write-Host "[i] conda not found, installing Miniconda (just for current user)..."

  $arch = if ([Environment]::Is64BitOperatingSystem) { 'x86_64' } else { 'x86' }
  if ($arch -ne 'x86_64') {
    throw "Unsupported Windows architecture ($arch) for automatic Miniconda install."
  }

  $uri = 'https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe'
  $installer = Join-Path $env:TEMP 'miniconda-installer.exe'
  Write-Host "[i] Downloading Miniconda from $uri"
  Invoke-WebRequest -Uri $uri -OutFile $installer -UseBasicParsing

  $arguments = @(
    '/InstallationType=JustMe',
    '/AddToPath=1',
    '/RegisterPython=0',
    '/S',
    "/D=$script:CondaRoot"
  )

  Start-Process -FilePath $installer -ArgumentList $arguments -Wait
  Remove-Item $installer -Force -ErrorAction SilentlyContinue

  $env:PATH = "$script:CondaRoot;" +
              "$script:CondaRoot\Scripts;" +
              "$script:CondaRoot\Library\bin;" +
              $env:PATH
  Write-Host "[✓] Miniconda installed to $script:CondaRoot"
}

function Ensure-Conda {
  if (-not (Get-Command conda -ErrorAction SilentlyContinue)) {
    $fallbackBins = @(
      $script:CondaRoot,
      (Join-Path $script:CondaRoot 'Scripts'),
      (Join-Path $script:CondaRoot 'Library\bin')
    )
    foreach ($bin in $fallbackBins) {
      if ($bin -and (Test-Path $bin) -and -not $env:PATH.Split(';') -contains $bin) {
        $env:PATH = "$bin;" + $env:PATH
      }
    }
  }

  if (-not (Get-Command conda -ErrorAction SilentlyContinue)) {
    try {
      Install-Conda
    } catch {
      throw "Failed to install conda automatically: $_"
    }
  }
}

function Invoke-Conda {
  param([string[]]$CondaArgs)
  & conda @CondaArgs
}

function Create-Env {
  Ensure-Conda
  $list = (& conda env list | ForEach-Object { ($_ -split '\s+')[0] }) | Where-Object { $_ }
  if ($list -contains $script:EnvName) {
    Write-Host "[i] conda env '$EnvName' already exists"
  } else {
    Write-Host "[+] Creating conda env '$EnvName' (python=$PyVersion)"
    Invoke-Conda @('create','-n',$EnvName,"python=$PyVersion",'-y')
  }
}

function Install-Backend {
  Write-Host "[+] Installing backend dependencies"
  Invoke-Conda @('run','-n',$EnvName,'python','-m','pip','install','-U','pip')
  Invoke-Conda @('run','-n',$EnvName,'python','-m','pip','install','-r',(Join-Path $BackendDir 'requirements.txt'))
  if ($WithOcr) {
    Write-Host "[+] Installing Tesseract OCR"
    try {
      Invoke-Conda @('install','-n',$EnvName,'-c','conda-forge','-y','tesseract')
    } catch {
      Write-Warning "Tesseract install failed: $_"
    }
  }
}

function Install-Frontend {
  Write-Host "[+] Installing frontend dependencies"
  Push-Location $WebDir
  try {
    & npm.cmd install --legacy-peer-deps
  } finally {
    Pop-Location
  }
}

function Setup {
  Parse-CommonFlags $Args | Out-Null
  Create-Env
  Install-Backend
  Install-Frontend
  Write-Host "[✓] Setup complete. Use: powershell -File scripts/dev.ps1 start --env $EnvName"
}

function Stop-Port {
  param([int]$TargetPort)
  try {
    $conn = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($conn) {
      Write-Host "[i] Stopping process on port $TargetPort (PID $($conn.OwningProcess))"
      Stop-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
    }
  } catch {
  }
}

function Start-Backend {
  Parse-CommonFlags $Args | Out-Null
  if (-not (Test-Path (Join-Path $BackendDir 'storage'))) {
    New-Item -ItemType Directory -Path (Join-Path $BackendDir 'storage') | Out-Null
  }
  
  # Create .env.engine if it doesn't exist
  $envFile = Join-Path $BackendDir '.env.engine'
  if (-not (Test-Path $envFile)) {
    Write-Host "[+] Creating .env.engine"
    $envContent = @"
# Backend Environment Configuration
DB_TYPE=sqlite
DOCMIND_DB=storage/docmind.db
LLM_PROVIDER=gemini
REQUIRE_API_KEY=false
GEMINI_REQUEST_TIMEOUT=30
RAG_TOP_K=6
RAG_MAX_CONTEXT_TOKENS=1800
RAG_BLOCK_MAX_TOKENS=800
RAG_BLOCK_TARGET_TOKENS=400
RAG_BLOCK_OVERLAP_TOKENS=80
RAG_MMR_LAMBDA=0.5
RAG_SIMILARITY_THRESHOLD=0.65
RAG_EMBEDDING_MODEL=text-embedding-004
RAG_GENERATION_MODEL=gemini-1.5-flash
ALLOWED_ORIGINS=http://localhost:5173,https://mengyang0529.github.io,https://kakuti.xyz
HF_HOME=/tmp
RATE_LIMIT_PER_MINUTE=120
RATE_LIMIT_BURST=60
"@
    Set-Content -Path $envFile -Value $envContent -Encoding UTF8
    Write-Host "[i] Please update $envFile with your API keys"
  }
  
  Stop-Port -TargetPort $Port
  Write-Host "[+] Starting backend on :$Port"
  $cmd = "set ENV_FILE=.env.engine && conda run -n $EnvName python -m uvicorn app.main:app --host 0.0.0.0 --port $Port >> `"$LogBackend`" 2>&1"
  $process = Start-Process -FilePath "cmd.exe" -ArgumentList '/c', $cmd -WorkingDirectory $BackendDir -WindowStyle Hidden -PassThru
  Set-Content -Path $PidBackend -Value $process.Id
  Start-Sleep -Seconds 1
  Write-Host "[i] Backend PID: $($process.Id) | Log: $LogBackend"
}

function Start-Frontend {
  Parse-CommonFlags $Args | Out-Null
  
  # Create .env.ui if it doesn't exist
  $envFile = Join-Path $WebDir '.env.ui'
  if (-not (Test-Path $envFile)) {
    Write-Host "[+] Creating .env.ui"
    $envContent = @"
# Frontend Environment Configuration
VITE_API_BASE_URL=http://localhost:8001/api/v1
VITE_API_KEY=test-key
"@
    Set-Content -Path $envFile -Value $envContent -Encoding UTF8
  }
  
  Write-Host "[+] Starting frontend (Vite dev server)"
  $cmd = "set ENV_FILE=.env.ui && npm.cmd run dev -- --host >> `"$LogWeb`" 2>&1"
  $process = Start-Process -FilePath "cmd.exe" -ArgumentList '/c', $cmd -WorkingDirectory $WebDir -WindowStyle Hidden -PassThru
  Set-Content -Path $PidWeb -Value $process.Id
  Start-Sleep -Seconds 1
  Write-Host "[i] Frontend PID: $($process.Id) | Log: $LogWeb"
}

function Start-All {
  Parse-CommonFlags $Args | Out-Null
  Start-Backend
  Start-Frontend
  Write-Host "[✓] Dev servers started: backend :$Port, frontend :5173"
}

function Stop-All {
  Write-Host "[i] Stopping frontend"
  if (Test-Path $PidWeb) {
    $pid = Get-Content $PidWeb
    Stop-Process -Id $pid -ErrorAction SilentlyContinue
    Remove-Item $PidWeb -ErrorAction SilentlyContinue
  }
  Write-Host "[i] Stopping backend"
  if (Test-Path $PidBackend) {
    $pid = Get-Content $PidBackend
    Stop-Process -Id $pid -ErrorAction SilentlyContinue
    Remove-Item $PidBackend -ErrorAction SilentlyContinue
  }
  Write-Host "[✓] Stopped"
}

function Show-Status {
  Write-Host "[ Backend ]"
  if (Test-Path $PidBackend) {
    $pid = Get-Content $PidBackend
    if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
      Write-Host "  PID: $pid (running)"
    } else {
      Write-Host "  PID file exists but process not running"
    }
  } else {
    Write-Host "  not started"
  }
  Write-Host "[ Frontend ]"
  if (Test-Path $PidWeb) {
    $pid = Get-Content $PidWeb
    if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
      Write-Host "  PID: $pid (running)"
    } else {
      Write-Host "  PID file exists but process not running"
    }
  } else {
    Write-Host "  not started"
  }
}

switch ($Command.ToLowerInvariant()) {
  'setup' { Setup }
  'start' { Start-All }
  'stop' { Stop-All }
  'status' { Show-Status }
  'frontend' { Start-Frontend }
  'backend' { Start-Backend }
  'help' { Show-Usage }
  default { Show-Usage }
}
