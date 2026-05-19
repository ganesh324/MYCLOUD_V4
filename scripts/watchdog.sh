#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${MYCLOUD_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
ENV_FILE="${MYCLOUD_ENV_FILE:-$APP_DIR/app/data/mycloud.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

HEALTH_URL="${MYCLOUD_HEALTH_URL:-http://localhost:3000/api/health}"
LOG_FILE="${MYCLOUD_WATCHDOG_LOG:-$APP_DIR/app/data/watchdog.log}"

mkdir -p "$(dirname "$LOG_FILE")"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  printf "%s %s\n" "$(timestamp)" "$*" >> "$LOG_FILE"
}

if curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null; then
  log "healthy $HEALTH_URL"
  exit 0
fi

log "unhealthy $HEALTH_URL; restarting docker compose stack"
cd "$APP_DIR"
docker compose restart >> "$LOG_FILE" 2>&1

sleep 20

if curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null; then
  log "recovered after restart"
  exit 0
fi

log "still unhealthy after restart"
exit 1
