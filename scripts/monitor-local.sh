#!/usr/bin/env bash
set -euo pipefail

cd /Users/alf/.openclaw/workspace/agents/coding/repo

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Ensure dependencies + fresh static bundle
if [ ! -d node_modules ]; then
  npm ci
fi
npm run build

# Start Netlify local runtime (static + functions)
exec npx netlify dev --port 8888 --dir dist
