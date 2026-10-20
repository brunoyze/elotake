#!/bin/bash
# Prepara uma Vercel Sandbox (imagem vercel/sandbox/ubuntu) para rodar o motor.
# Idempotente: se o ambiente já existe (ex.: veio de um snapshot), não faz nada.
set -euo pipefail

VENV=/vercel/venv
if [ -x "$VENV/bin/python" ] && command -v ffmpeg >/dev/null; then
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
sudo -E apt-get update -qq
sudo -E apt-get install -y -qq --no-install-recommends \
  ffmpeg fonts-inter python3 python3-venv ca-certificates >/dev/null

python3 -m venv "$VENV"
"$VENV/bin/pip" install -q "anthropic>=1.0" "pydantic>=2.7" "faster-whisper>=1.0"

# Baixa o modelo de transcrição agora, para não pagar isso no meio da edição.
"$VENV/bin/python" -c "from faster_whisper import WhisperModel; WhisperModel('${ELOTAKE_WHISPER_MODEL:-small}', device='cpu', compute_type='int8')"
