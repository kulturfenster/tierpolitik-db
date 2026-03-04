#!/usr/bin/env bash
set -euo pipefail
cd /Users/alf/.openclaw/workspace/tierpolitik-vorstoesse-db-metanet-static
exec /opt/homebrew/bin/python3 -m http.server 8888 --bind 0.0.0.0
