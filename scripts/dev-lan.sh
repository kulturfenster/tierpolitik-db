#!/usr/bin/env bash
set -euo pipefail

PORT_PUBLIC="${PORT_PUBLIC:-8890}"
PORT_NETLIFY="${PORT_NETLIFY:-8888}"

if ! command -v socat >/dev/null 2>&1; then
  echo "[dev-lan] socat fehlt. Installiere mit: brew install socat"
  exit 1
fi

cleanup() {
  if [[ -n "${SOCAT_PID:-}" ]]; then
    kill "$SOCAT_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "[dev-lan] Starte LAN-Forward 0.0.0.0:${PORT_PUBLIC} -> 127.0.0.1:${PORT_NETLIFY}"
socat "TCP-LISTEN:${PORT_PUBLIC},reuseaddr,fork,bind=0.0.0.0" "TCP:127.0.0.1:${PORT_NETLIFY}" &
SOCAT_PID=$!

echo "[dev-lan] Starte netlify dev auf :${PORT_NETLIFY}"
exec npx netlify dev --port "${PORT_NETLIFY}"
