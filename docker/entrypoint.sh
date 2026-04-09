#!/usr/bin/env bash
set -euo pipefail

export EFACT_HTTP_HOST="${EFACT_HTTP_HOST:-0.0.0.0}"
export EFACT_HTTP_PORT="${EFACT_HTTP_PORT:-8765}"
export OUTPUT_DIR="${OUTPUT_DIR:-/data/efact-output}"
mkdir -p "$OUTPUT_DIR"

# API del bot (Python) en segundo plano; Node sirve la app y llama a http://127.0.0.1:8765
cd /app/bot
if [[ -x /app/bot/.venv/bin/python ]]; then
  PY=/app/bot/.venv/bin/python
else
  PY=python3
fi

"$PY" api_server.py &
EFACT_PID=$!

cleanup() {
  kill "$EFACT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Breve espera para que el API Python enlace el puerto (sin depender de curl)
sleep 1

cd /app
exec node server/index.js
