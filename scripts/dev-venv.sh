#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
WEB_DIR="$ROOT_DIR/web"
PID_BACKEND="$ROOT_DIR/backend_uvicorn.pid"
LOG_BACKEND="$ROOT_DIR/backend_uvicorn.log"
PID_WEB="$ROOT_DIR/web_vite.pid"
LOG_WEB="$ROOT_DIR/web_vite.log"

PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="${VENV_DIR:-$ROOT_DIR/.venv}"
PORT="8001"
WITH_OCR="false"

usage() {
  cat <<USAGE
dev-venv.sh — setup and run using python -m venv

Usage:
  bash scripts/dev-venv.sh setup [--python <python3>] [--venv <path>] [--ocr]
  bash scripts/dev-venv.sh start [--python <python3>] [--venv <path>] [--port <8001>]
  bash scripts/dev-venv.sh stop
  bash scripts/dev-venv.sh status
  bash scripts/dev-venv.sh frontend
  bash scripts/dev-venv.sh backend [--python <python3>] [--venv <path>] [--port <8001>]
USAGE
}

have() { command -v "$1" >/dev/null 2>&1; }

parse_common_flags() {
  local ARGS=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --python) PYTHON_BIN="$2"; shift 2;;
      --venv) VENV_DIR="$2"; shift 2;;
      --ocr) WITH_OCR="true"; shift;;
      --port) PORT="$2"; shift 2;;
      -h|--help) usage; exit 0;;
      *) ARGS+=("$1"); shift;;
    esac
  done
  set -- "${ARGS[@]:-}"
}

ensure_python() {
  if ! have "$PYTHON_BIN"; then
    echo "[!] Python binary '$PYTHON_BIN' not found." >&2
    exit 1
  fi
}

create_venv() {
  ensure_python
  if [[ ! -d "$VENV_DIR" ]]; then
    echo "[+] Creating virtual environment at $VENV_DIR"
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  else
    echo "[i] Virtual environment already exists at $VENV_DIR"
  fi
}

venv_python() {
  if [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* || "$OSTYPE" == win32 ]]; then
    echo "$VENV_DIR/Scripts/python"
  else
    echo "$VENV_DIR/bin/python"
  fi
}

install_backend() {
  local py
  py="$(venv_python)"
  echo "[+] Upgrading pip"
  "$py" -m pip install -U pip
  echo "[+] Installing backend requirements"
  "$py" -m pip install -r "$BACKEND_DIR/requirements.txt"
  if [[ "$WITH_OCR" == "true" ]]; then
    echo "[!] OCR dependencies (e.g., Tesseract) must be installed manually on the system."
  fi
}

install_frontend() {
  echo "[+] Installing frontend dependencies (npm)"
  (cd "$WEB_DIR" && npm install --legacy-peer-deps)
}

setup() {
  parse_common_flags "$@"
  create_venv
  install_backend
  install_frontend
  echo "[✓] Setup complete. Use: bash scripts/dev-venv.sh start --venv $VENV_DIR"
}

start_backend() {
  parse_common_flags "$@"
  mkdir -p "$BACKEND_DIR/storage"
  local py port
  py="$(venv_python)"
  port="${PORT:-8001}"
  local pids
  pids=$(lsof -ti :"$port" || true)
  if [[ -n "$pids" ]]; then
    echo "[i] Stopping existing process on port $port: $pids"
    kill $pids 2>/dev/null || true
    sleep 1
  fi
  echo "[+] Starting backend on :$port"
  export ENV_FILE=".env.engine"
  (cd "$BACKEND_DIR" && nohup "$py" -m uvicorn app.main:app --port "$port" > "$LOG_BACKEND" 2>&1 & echo $! > "$PID_BACKEND")
  sleep 1
  echo "[i] Backend PID: $(cat "$PID_BACKEND" 2>/dev/null || echo unknown) | Log: $LOG_BACKEND"
}

start_frontend() {
  echo "[+] Starting frontend (Vite dev server)"
  export ENV_FILE=".env.ui"
  (cd "$WEB_DIR" && nohup npm run dev -- --host > "$LOG_WEB" 2>&1 & echo $! > "$PID_WEB")
  sleep 1
  echo "[i] Frontend PID: $(cat "$PID_WEB" 2>/dev/null || echo unknown) | Log: $LOG_WEB"
}

start() {
  parse_common_flags "$@"
  start_backend --port "$PORT"
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
*) usage ;;
esac
