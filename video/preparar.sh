#!/usr/bin/env bash
# Deixa o computador pronto para editar vídeo: ffmpeg, faster-whisper (transcrição)
# e a biblioteca de sons. Pode rodar quantas vezes quiser; só instala o que falta.
#
#   bash video/preparar.sh              instala o que falta
#   bash video/preparar.sh --modelo     também baixa o modelo de transcrição (small)
set -e
cd "$(dirname "$0")"

ok()   { printf "  ✓ %s\n" "$1"; }
falta(){ printf "  ✗ %s\n" "$1"; }

echo "Conferindo o que já existe…"

# --- ffmpeg
if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  ok "ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"
else
  falta "ffmpeg — instalando"
  if command -v brew >/dev/null 2>&1; then brew install ffmpeg
  elif command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" = "0" ]; then apt-get update -qq && apt-get install -y -qq ffmpeg
    else sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg; fi
  else echo "Instale o ffmpeg manualmente (https://ffmpeg.org/download.html) e rode de novo."; exit 1; fi
  ok "ffmpeg instalado"
fi

# --- node
if command -v node >/dev/null 2>&1; then ok "node $(node --version)"; else falta "node — instale em https://nodejs.org e rode de novo"; exit 1; fi

# --- python + faster-whisper
if command -v python3 >/dev/null 2>&1; then
  if python3 -c "import faster_whisper" >/dev/null 2>&1; then ok "faster-whisper (transcrição)"
  else
    falta "faster-whisper — instalando"
    python3 -m pip install --quiet faster-whisper || python3 -m pip install --quiet --user faster-whisper
    ok "faster-whisper instalado"
  fi
else
  falta "python3 — instale em https://www.python.org e rode de novo"; exit 1
fi

# --- biblioteca de sons
if [ -f biblioteca/sfx/pop.wav ] && [ -f biblioteca/trilhas/calma.m4a ]; then ok "biblioteca de sons"
else echo "  … gerando biblioteca de sons"; node biblioteca/gerar-sons.js; fi

# --- pastas de trabalho
mkdir -p entrada trabalho saida
ok "pastas entrada/, trabalho/, saida/"

# --- modelo de transcrição (opcional)
if [ "$1" = "--modelo" ]; then
  echo "Baixando o modelo de transcrição (small, ~500 MB, só na primeira vez)…"
  python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8'); print('  ✓ modelo small pronto')"
fi

echo
echo "Pronto. Coloque o vídeo em video/entrada/ e peça a edição."
