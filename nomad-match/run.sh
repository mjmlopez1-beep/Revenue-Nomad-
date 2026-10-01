#!/usr/bin/env bash
# Start (or restart) nomad-match on http://localhost:8000
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi
pkill -f "uvicorn nomad_match.app:app" 2>/dev/null || true
[ -f data/index.sqlite ] || .venv/bin/python -m nomad_match.build_index
exec .venv/bin/uvicorn nomad_match.app:app --host 0.0.0.0 --port "${PORT:-8000}"
