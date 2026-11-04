#!/bin/bash
# Drive the deployed app in headless chromium over CDP.
# usage: live-check.sh <entry.mjs> [baseUrl]
set -e
PROJ=$(cd "$(dirname "$0")/.." && pwd)
ENTRY="$1"
BASE="${2:-http://127.0.0.1:8080}"
CDP=${CDP_PORT:-9333}

chromium --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --remote-debugging-port=$CDP about:blank >/dev/null 2>&1 &
CHR=$!
trap 'kill $CHR 2>/dev/null || true' EXIT

sleep 2
cd "$PROJ"
node "$ENTRY" "$BASE" || true
