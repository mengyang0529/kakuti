#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
WEB_DIR="$ROOT_DIR/web"
PID_BACKEND="$ROOT_DIR/backend_uvicorn.pid"
LOG_BACKEND="$ROOT_DIR/backend_uvicorn.log"
PID_WEB="$ROOT_DIR/web_vite.pid"
LOG_WEB="$ROOT_DIR/web_vite.log"

ENV_NAME="kakuti"
PY_VERSION="3.11"
WITH_OCR="false"
MINICONDA_DIR="${MINICONDA_HOME:-$HOME/miniconda3}"

usage() {
  cat <<USAGE
dev.sh — one‑shot setup and dev runner

Usage:
  bash scripts/dev.sh setup [--env <name>] [--ocr]
  bash scripts/dev.sh start [--env <name>] [--port <8001>]
  bash scripts/dev.sh stop
  bash scripts/dev.sh status
  bash scripts/dev.sh frontend
  bash scripts/dev.sh backend [--env <name>] [--port <8001>]

Defaults:
  conda env: kakuti
  python:    3.11
  backend:   http://127.0.0.1:8001

Examples:
  bash scripts/dev.sh setup --env kakuti --ocr
  bash scripts/dev.sh start --env kakuti --port 8001
USAGE
}

have() { command -v "$1" >/dev/null 2>&1; }

parse_common_flags() {
  local ARGS=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env) ENV_NAME="$2"; shift 2;;
      --ocr) WITH_OCR="true"; shift;;
      --port) PORT="$2"; shift 2;;
      -h|--help) usage; exit 0;;
      *) ARGS+=("$1"); shift;;
    esac
  done
  set -- "${ARGS[@]:-}"
}

install_miniconda() {
  local os arch url installer
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$os" in
    linux)
      case "$arch" in
        x86_64) url="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh" ;;
        aarch64|arm64) url="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-aarch64.sh" ;;
        *) echo "[!] Unsupported architecture '$arch' for automatic Miniconda install" >&2; return 1 ;;
      esac
      ;;
    darwin)
      case "$arch" in
        x86_64) url="https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh" ;;
        arm64) url="https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.sh" ;;
        *) echo "[!] Unsupported architecture '$arch' for automatic Miniconda install" >&2; return 1 ;;
      esac
      ;;
    *)
      echo "[!] Unsupported OS '$os' for automatic Miniconda install" >&2
      return 1
      ;;
  esac

  installer="${TMPDIR:-/tmp}/miniconda-installer.sh"
  echo "[i] Downloading Miniconda from $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$installer"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$installer"
  else
    echo "[!] Neither curl nor wget is available to download Miniconda" >&2
    return 1
  fi

  bash "$installer" -b -p "$MINICONDA_DIR"
  rm -f "$installer"

  export PATH="$MINICONDA_DIR/bin:$PATH"
  hash -r
  echo "[✓] Miniconda installed to $MINICONDA_DIR"
}

ensure_conda() {
  if ! have conda && [ -x "$MINICONDA_DIR/bin/conda" ]; then
    export PATH="$MINICONDA_DIR/bin:$PATH"
    hash -r
  fi
  if ! have conda; then
    echo "[i] conda not found, attempting automatic Miniconda install..."
    if ! install_miniconda; then
      echo "[!] Failed to install Miniconda automatically. Please install conda manually and retry." >&2
      exit 1
    fi
  fi
}

create_env() {
  ensure_conda
  if conda env list | awk '{print $1}' | grep -qx "$ENV_NAME"; then
    echo "[i] conda env '$ENV_NAME' already exists"
  else
    echo "[+] Creating conda env '$ENV_NAME' (python=$PY_VERSION)"
    conda create -n "$ENV_NAME" "python=$PY_VERSION" -y
  fi
}

install_backend() {
  echo "[+] Installing backend dependencies (pip)"
  conda run -n "$ENV_NAME" python -m pip install -U pip
  conda run -n "$ENV_NAME" python -m pip install -r "$BACKEND_DIR/requirements.txt"
  if [[ "$WITH_OCR" == "true" ]]; then
    echo "[+] Installing Tesseract OCR (conda-forge)"
    conda install -n "$ENV_NAME" -c conda-forge -y tesseract || true
  fi
}

install_frontend() {
  echo "[+] Installing frontend dependencies (npm)"
  (cd "$WEB_DIR" && npm install --legacy-peer-deps)
}

setup() {
  parse_common_flags "$@"
  create_env
  install_backend
  install_frontend
  echo "[✓] Setup complete. Use: bash scripts/dev.sh start --env $ENV_NAME"
}

start_backend() {
  local PORT="${PORT:-8001}"
  mkdir -p "$BACKEND_DIR/storage"
  # Stop any existing backend on the port
  local pids
  pids=$(lsof -ti :"$PORT" || true)
  if [[ -n "$pids" ]]; then
    echo "[i] Stopping existing process on port $PORT: $pids"
    kill $pids 2>/dev/null || true
    sleep 1
  fi
  echo "[+] Starting backend on :$PORT"
  
  # Create .env.engine if it doesn't exist
  if [[ ! -f "$BACKEND_DIR/.env.engine" ]]; then
    echo "[+] Creating .env.engine from env-vars.yaml"
    cat > "$BACKEND_DIR/.env.engine" << 'EOF'
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
EOF
    echo "[i] Please update $BACKEND_DIR/.env.engine with your API keys"
  fi
  
  # Set environment file for backend
  export ENV_FILE=".env.engine"
  (cd "$BACKEND_DIR" && conda run -n "$ENV_NAME" bash -lc "nohup uvicorn app.main:app --port $PORT > '$LOG_BACKEND' 2>&1 & echo \$! > '$PID_BACKEND'")
  sleep 1
  echo "[i] Backend PID: $(cat "$PID_BACKEND" 2>/dev/null || echo unknown) | Log: $LOG_BACKEND"
}

start_frontend() {
  echo "[+] Starting frontend (Vite dev server)"
  
  # Create .env.ui if it doesn't exist
  if [[ ! -f "$WEB_DIR/.env.ui" ]]; then
    echo "[+] Creating .env.ui"
    cat > "$WEB_DIR/.env.ui" << 'EOF'
# Frontend Environment Configuration
VITE_API_BASE_URL=http://localhost:8001/api/v1
VITE_API_KEY=test-key
EOF
  fi
  
  # Set environment file for frontend
  export ENV_FILE=".env.ui"
  (cd "$WEB_DIR" && nohup npm run dev -- --host > "$LOG_WEB" 2>&1 & echo $! > "$PID_WEB")
  sleep 1
  echo "[i] Frontend PID: $(cat "$PID_WEB" 2>/dev/null || echo unknown) | Log: $LOG_WEB"
}

start() {
  parse_common_flags "$@"
  start_backend
  start_frontend
  echo "[✓] Dev servers started: backend :${PORT:-8001}, frontend :5173"
}

stop() {
  echo "[i] Stopping frontend"
  if [[ -f "$PID_WEB" ]]; then
    kill "$(cat "$PID_WEB")" 2>/dev/null || true
    rm -f "$PID_WEB"
  fi
  echo "[i] Stopping backend"
  if [[ -f "$PID_BACKEND" ]]; then
    kill "$(cat "$PID_BACKEND")" 2>/dev/null || true
    rm -f "$PID_BACKEND"
  fi
  echo "[✓] Stopped"
}

status() {
  echo "[ Backend ]"
  if [[ -f "$PID_BACKEND" ]]; then
    local bpid; bpid=$(cat "$PID_BACKEND")
    if ps -p "$bpid" >/dev/null 2>&1; then
      echo "  PID: $bpid (running)"
    else
      echo "  PID file exists but process not running"
    fi
  else
    echo "  not started"
  fi
  echo "[ Frontend ]"
  if [[ -f "$PID_WEB" ]]; then
    local fpid; fpid=$(cat "$PID_WEB")
    if ps -p "$fpid" >/dev/null 2>&1; then
      echo "  PID: $fpid (running)"
    else
      echo "  PID file exists but process not running"
    fi
  else
    echo "  not started"
  fi
}

case "${1:-}" in
  setup) shift; setup "$@" ;;
  start) shift; start "$@" ;;
  stop)  shift; stop "$@" ;;
  status) shift; status "$@" ;;
  frontend) shift; start_frontend "$@" ;;
  backend) shift; start_backend "$@" ;;
  -h|--help|help|*) usage ;;
esac
