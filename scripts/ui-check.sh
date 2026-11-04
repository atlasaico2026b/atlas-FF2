#!/bin/bash
# Bundle a check script, serve it, drive it in headless chromium over CDP.
# usage: ui-check.sh <entry.tsx> <slug> [shot.png] [waitMs] [height]
set -e
PROJ=$(cd "$(dirname "$0")/.." && pwd)
ENTRY="$1"; SLUG="${2:-check}"; SHOT="$3"; WAIT="${4:-2500}"; HEIGHT="${5:-2100}"
OUT=/tmp/hz-$SLUG
PORT=${UI_PORT:-8127}
CDP=${CDP_PORT:-9333}

rm -rf "$OUT"; mkdir -p "$OUT"
cd "$PROJ"

bun x esbuild "$ENTRY" \
  --bundle --outfile="$OUT/bundle.js" --jsx=automatic \
  --loader:.tsx=tsx --loader:.css=css \
  --alias:@=./src \
  --define:process.env.NODE_ENV='"development"' \
  --log-level=warning

cp "$(ls -t dist/assets/*.css | head -1)" "$OUT/app.css"

# The app serves public/ at the site root, so a harness that draws real
# artwork needs those files next to it or every icon request 404s.
mkdir -p "$OUT/point-icons"
cp public/point-icons/*.png "$OUT/point-icons/" 2>/dev/null || true

cat > "$OUT/index.html" <<HTML
<!doctype html><html lang="fa"><head><meta charset="utf-8">
<title>waiting</title><link rel="stylesheet" href="app.css"></head>
<body style="margin:0"><div id="root"></div>
<script src="bundle.js"></script></body></html>
HTML

cd "$OUT"
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SRV=$!
chromium --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --remote-debugging-port=$CDP about:blank >/dev/null 2>&1 &
CHR=$!
trap 'kill $SRV $CHR 2>/dev/null || true' EXIT

sleep 2
cd "$PROJ"
if [ -n "$SHOT" ]; then
  node scripts/shot.mjs "http://127.0.0.1:$PORT/" "$SHOT" "$WAIT" "${WIDTH:-1200}" "$HEIGHT" || true
else
  node scripts/cdp-read.mjs "http://127.0.0.1:$PORT/" || true
fi
