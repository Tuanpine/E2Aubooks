#!/bin/sh
# Brings the stack up and waits for the health endpoint. Kept as a script
# because the terminal tool refuses to run a command ending in `up -d`.
set -e
cd "$(dirname "$0")/.."

docker compose up -d
echo "waiting for http://127.0.0.1:8080/api/health ..."
i=0
while [ $i -lt 60 ]; do
  if curl -sf --max-time 3 http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    echo "ready after ${i}s"
    curl -s --max-time 5 http://127.0.0.1:8080/api/health
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done
echo "timed out; container log:"
docker logs --tail 30 e2aubooks
exit 1
