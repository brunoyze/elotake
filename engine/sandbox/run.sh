#!/bin/bash
# Ponto de entrada de um trabalho na Vercel Sandbox: prepara a máquina e roda o worker.
#   bash run.sh /vercel/job/job.json
set -uo pipefail

JOB="$1"
DIR="$(dirname "$JOB")"
STATUS="$DIR/status.json"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo '{"status":"preparando","progresso":0.01}' > "$STATUS"
if ! bash "$HERE/setup.sh" > "$DIR/setup.log" 2>&1; then
  echo '{"status":"erro","erro":"falha ao preparar a máquina de edição (veja setup.log)"}' > "$STATUS"
  exit 1
fi

cd "$HERE" && exec /vercel/venv/bin/python -m elotake_engine.worker "$JOB" > "$DIR/worker.log" 2>&1
