#!/usr/bin/env bash
# Chạy E2Aubooks. Dùng: ./run.sh [port]
set -e
cd "$(dirname "$0")"

PORT="${1:-3222}"
# ./run.sh 3223 cuda:1 10  -> second app on GPU 1, daemon ports shifted by 10
export TTS_DEVICE="${2:-}"
export TTS_PORT_OFFSET="${3:-0}"

# NODE_ENV=production trong shell của bạn khiến server chạy nhánh static và
# cần dist/ có sẵn. Bỏ biến đó ra ở đây để lỗi này không tái diễn.
unset NODE_ENV

# Dừng instance cũ (nếu có) để không tranh port.
fuser -k "$PORT"/tcp 2>/dev/null || true
# Only the primary instance owns the default daemon ports.
if [ "$TTS_PORT_OFFSET" = "0" ]; then
  for p in 9980 9981 9982; do fuser -k "$p"/tcp 2>/dev/null || true; done
fi
sleep 1

if [ ! -f dist/index.html ] || [ -n "$(find src -newer dist/index.html -name '*.ts*' -print -quit 2>/dev/null)" ]; then
  echo "▸ dist/ cũ hoặc chưa có — đang build..."
  npx vite build
fi

echo "▸ http://localhost:$PORT  (Ctrl+C để dừng)"
export PORT
exec npx tsx server.ts
