#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8888}"

check() {
  local path="$1"
  local code
  code=$(curl -s -o /tmp/monitor_smoke_body.tmp -w "%{http_code}" --max-time 10 "${BASE_URL}${path}")
  if [[ "$code" != "200" ]]; then
    echo "FAIL ${path} -> ${code}"
    return 1
  fi
  echo "OK   ${path} -> ${code}"
}

check "/debug.html"
check "/review.html"
check "/data/debug-stats.json"
check "/data/review-inbox.json"

# Ensure debug stats parses as JSON
python3 - <<'PY'
import json
p='/Users/alf/.openclaw/workspace/tierpolitik-vorstoesse-db-metanet-static/data/debug-stats.json'
json.load(open(p))
print('OK   debug-stats.json parse')
PY

echo "SMOKE OK"
