#!/usr/bin/env bash
set -euo pipefail

MAC_IP="${MAC_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)}"
NETLIFY_PORT="${NETLIFY_PORT:-8888}"
LAN_PORT="${LAN_PORT:-8890}"

red() { printf "\033[31m%s\033[0m\n" "$*"; }
grn() { printf "\033[32m%s\033[0m\n" "$*"; }
yel() { printf "\033[33m%s\033[0m\n" "$*"; }

if ! command -v socat >/dev/null 2>&1; then
  red "socat fehlt. Installiere mit: brew install socat"
  exit 1
fi

yel "[1/4] Alte Prozesse bereinigen"
pkill -f "netlify dev|dev-lan.sh|socat" >/dev/null 2>&1 || true
sleep 1

yel "[2/4] Netlify lokal starten (:${NETLIFY_PORT})"
( npx netlify dev --port "${NETLIFY_PORT}" > /tmp/monitor-netlify-dev.log 2>&1 ) &
NETLIFY_PID=$!

for i in {1..25}; do
  if curl -fsS "http://127.0.0.1:${NETLIFY_PORT}/.netlify/functions/review-items" >/tmp/monitor-local.json 2>/dev/null; then
    grn "Local function OK on :${NETLIFY_PORT}"
    break
  fi
  sleep 1
  if [[ $i -eq 25 ]]; then
    red "Local function nicht erreichbar auf :${NETLIFY_PORT}."
    tail -n 40 /tmp/monitor-netlify-dev.log || true
    exit 1
  fi
done

yel "[3/4] LAN Forward starten (:${LAN_PORT} -> :${NETLIFY_PORT})"
( socat "TCP-LISTEN:${LAN_PORT},reuseaddr,fork,bind=0.0.0.0" "TCP:127.0.0.1:${NETLIFY_PORT}" > /tmp/monitor-socat.log 2>&1 ) &
SOCAT_PID=$!
sleep 1

if ! lsof -nP -iTCP:${LAN_PORT} -sTCP:LISTEN | grep -q socat; then
  red "socat lauscht nicht auf :${LAN_PORT}"
  tail -n 40 /tmp/monitor-socat.log || true
  exit 1
fi

yel "[4/4] Self-test"
if curl -fsS "http://127.0.0.1:${LAN_PORT}/.netlify/functions/review-items" >/tmp/monitor-lan-local.json 2>/dev/null; then
  grn "LAN-Forward lokal OK"
else
  red "LAN-Forward lokal FEHLER"
  exit 1
fi

echo
grn "✅ Monitor läuft"
echo "Mac lokal:   http://localhost:${NETLIFY_PORT}/review"
echo "LAN (andere PCs): http://${MAC_IP}:${LAN_PORT}/review"
echo
echo "Logs: /tmp/monitor-netlify-dev.log | /tmp/monitor-socat.log"
echo "Stoppen: pkill -f 'netlify dev|socat'"
