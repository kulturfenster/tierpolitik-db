#!/usr/bin/env bash
set -euo pipefail

LABEL="ai.openclaw.tierpolitik-review"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
ROOT="/Users/alf/.openclaw/workspace/tierpolitik-vorstoesse-db-metanet-static"
PY="$ROOT/.venv/bin/python"
SCRIPT="$ROOT/scripts/review_server.py"
LOG_DIR="$ROOT/logs"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${PY}</string>
      <string>${SCRIPT}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${ROOT}</string>

    <key>EnvironmentVariables</key>
    <dict>
      <key>TPM_REVIEW_HOST</key>
      <string>127.0.0.1</string>
      <key>TPM_REVIEW_PORT</key>
      <string>8787</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/review-server.out.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/review-server.err.log</string>
  </dict>
</plist>
PLIST

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
launchctl start "$LABEL" || true

echo "Installed and started: $LABEL"
echo "Plist: $PLIST"
echo "Check: launchctl list | grep ${LABEL}"
