param(
  [string]$Command,
  [string]$Tag = "latest",
  [int]$Port = 8080,
  [string]$EnvFile = "",
  [switch]$Follow,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = (Get-Item $ScriptDir).Parent.FullName
$ImageName = "kakuti-fullstack"
$ContainerName = "kakuti-app"

function Show-Usage {
  Write-Host "docker-fullstack.ps1 — Build and run Kakuti fullstack Docker container" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 build [-Tag <tag>]"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 run [-Port <8080>] [-EnvFile <file>]"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 start [-Port <8080>] [-EnvFile <file>]"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 stop"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 restart [-Port <8080>] [-EnvFile <file>]"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 logs [-Follow]"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 shell"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 clean"
  Write-Host ""
  Write-Host "Commands:"
  Write-Host "  build     - Build the Docker image"
  Write-Host "  run       - Run container in foreground"
  Write-Host "  start     - Start container in background"
  Write-Host "  stop      - Stop the running container"
  Write-Host "  restart   - Stop and start the container"
  Write-Host "  logs      - Show container logs"
  Write-Host "  shell     - Open PowerShell in running container"
  Write-Host "  clean     - Remove container and image"
  Write-Host ""
  Write-Host "Parameters:"
  Write-Host "  -Tag <tag>        - Docker image tag (default: latest)"
  Write-Host "  -Port <port>      - Host port to bind (default: 8080)"
  Write-Host "  -EnvFile <file>   - Environment file to load"
  Write-Host "  -Follow           - Follow log output"
  Write-Host ""
  Write-Host "Examples:"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 build"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 start -Port 3000"
  Write-Host "  powershell -File scripts/docker-fullstack.ps1 logs -Follow"
  Write-Host ""
  Write-Host "Environment:"
  Write-Host "  Set these environment variables or use -EnvFile:"
  Write-Host "  - `$env:GEMINI_API_KEY     (required for AI features)"
  Write-Host "  - `$env:API_KEY           (required if REQUIRE_API_KEY=true)"
  Write-Host "  - `$env:REQUIRE_API_KEY   (default: true)"
}

function Test-Docker {
  try {
    $null = Get-Command docker -ErrorAction Stop
    $null = & docker info 2>$null
  } catch {
    Write-Host "[!] Docker is not installed or not running" -ForegroundColor Red
    Write-Host "Please install Docker Desktop and ensure it's running" -ForegroundColor Red
    exit 1
  }
}

function Build-Image {
  Write-Host "[+] Building Docker image: $ImageName`:$Tag" -ForegroundColor Green
  
  Push-Location $RootDir
  try {
    & docker build -f scripts/Dockerfile.fullstack -t "$ImageName`:$Tag" .
    if ($LASTEXITCODE -ne 0) {
      throw "Docker build failed"
    }
  } finally {
    Pop-Location
  }
  
  Write-Host "[✓] Build complete: $ImageName`:$Tag" -ForegroundColor Green
}

function Run-Container {
  param([bool]$Daemon = $false)
  
  $daemonFlag = if ($Daemon) { "-d" } else { "" }
  
  # Stop existing container if running
  $existing = & docker ps -q -f "name=$ContainerName" 2>$null
  if ($existing) {
    Write-Host "[i] Stopping existing container..." -ForegroundColor Yellow
    & docker stop $ContainerName | Out-Null
  }
  
  # Remove existing container if exists
  $existing = & docker ps -aq -f "name=$ContainerName" 2>$null
  if ($existing) {
    Write-Host "[i] Removing existing container..." -ForegroundColor Yellow
    & docker rm $ContainerName | Out-Null
  }
  
  Write-Host "[+] Starting container: $ContainerName on port $Port" -ForegroundColor Green
  
  # Build docker run arguments
  $dockerArgs = @(
    "run"
    if ($Daemon) { "-d" }
    "--name", $ContainerName
    "-p", "$Port`:8080"
    "--restart", "unless-stopped"
  ) | Where-Object { $_ -ne $null }
  
  # Add environment file if specified
  if ($EnvFile -and (Test-Path $EnvFile)) {
    $dockerArgs += "--env-file", $EnvFile
    Write-Host "[i] Using environment file: $EnvFile" -ForegroundColor Cyan
  } elseif ($EnvFile) {
    Write-Host "[!] Environment file not found: $EnvFile" -ForegroundColor Red
    exit 1
  }
  
  # Add individual environment variables if not using env file
  if (-not $EnvFile) {
    $envVars = @(
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY", 
      "API_KEY",
      "REQUIRE_API_KEY",
      "LLM_PROVIDER",
      "RAG_SIMILARITY_THRESHOLD"
    )
    
    foreach ($var in $envVars) {
      $value = [Environment]::GetEnvironmentVariable($var)
      if ($value) {
        $dockerArgs += "-e", "$var=$value"
      }
    }
  }
  
  $dockerArgs += "$ImageName`:$Tag"
  
  & docker @dockerArgs
  
  if ($Daemon) {
    Write-Host "[✓] Container started in background" -ForegroundColor Green
    Write-Host "[i] View logs with: powershell -File scripts/docker-fullstack.ps1 logs" -ForegroundColor Cyan
    Write-Host "[i] Access at: http://localhost:$Port" -ForegroundColor Cyan
  }
}

function Stop-Container {
  $existing = & docker ps -q -f "name=$ContainerName" 2>$null
  if ($existing) {
    Write-Host "[i] Stopping container: $ContainerName" -ForegroundColor Yellow
    & docker stop $ContainerName | Out-Null
    Write-Host "[✓] Container stopped" -ForegroundColor Green
  } else {
    Write-Host "[i] Container is not running" -ForegroundColor Yellow
  }
}

function Show-Logs {
  $existing = & docker ps -aq -f "name=$ContainerName" 2>$null
  if ($existing) {
    $logArgs = @("logs")
    if ($Follow) {
      $logArgs += "-f"
    }
    $logArgs += $ContainerName
    
    & docker @logArgs
  } else {
    Write-Host "[!] Container does not exist: $ContainerName" -ForegroundColor Red
    exit 1
  }
}

function Open-Shell {
  $existing = & docker ps -q -f "name=$ContainerName" 2>$null
  if ($existing) {
    Write-Host "[i] Opening shell in container: $ContainerName" -ForegroundColor Cyan
    & docker exec -it $ContainerName /bin/bash
  } else {
    Write-Host "[!] Container is not running: $ContainerName" -ForegroundColor Red
    exit 1
  }
}

function Clean-Up {
  Write-Host "[i] Cleaning up Docker resources..." -ForegroundColor Yellow
  
  # Stop and remove container
  $existing = & docker ps -aq -f "name=$ContainerName" 2>$null
  if ($existing) {
    & docker stop $ContainerName 2>$null | Out-Null
    & docker rm $ContainerName 2>$null | Out-Null
  }
  
  # Remove image
  $existingImage = & docker images -q $ImageName 2>$null
  if ($existingImage) {
    & docker rmi "$ImageName`:$Tag" 2>$null | Out-Null
  }
  
  Write-Host "[✓] Cleanup complete" -ForegroundColor Green
}

# Show help if requested
if ($Help -or -not $Command) {
  Show-Usage
  exit 0
}

# Check Docker availability
Test-Docker

# Execute command
try {
  switch ($Command.ToLowerInvariant()) {
    'build' {
      Build-Image
    }
    'run' {
      Run-Container -Daemon $false
    }
    'start' {
      Run-Container -Daemon $true
    }
    'stop' {
      Stop-Container
    }
    'restart' {
      Stop-Container
      Run-Container -Daemon $true
    }
    'logs' {
      Show-Logs
    }
    'shell' {
      Open-Shell
    }
    'clean' {
      Clean-Up
    }
    'help' {
      Show-Usage
    }
    default {
      Write-Host "[!] Unknown command: $Command" -ForegroundColor Red
      Write-Host ""
      Show-Usage
      exit 1
    }
  }
} catch {
  Write-Host "[!] Error: $_" -ForegroundColor Red
  exit 1
}
