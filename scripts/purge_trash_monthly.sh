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

STORAGE_ROOT="${MYCLOUD_STORAGE_ROOT:-/mnt/Drive1}"
DB_PATH="${MYCLOUD_DB_PATH:-$APP_DIR/app/data/stats.db}"
LOG_FILE="${MYCLOUD_TRASH_PURGE_LOG:-$APP_DIR/app/data/trash_purge.log}"
TRASH_ROOT="$STORAGE_ROOT/.mycloud_trash"

mkdir -p "$(dirname "$LOG_FILE")"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  printf "%s %s\n" "$(timestamp)" "$*" >> "$LOG_FILE"
}

if [ ! -d "$TRASH_ROOT" ]; then
  log "trash directory not found: $TRASH_ROOT"
  exit 0
fi

resolved_storage="$(realpath "$STORAGE_ROOT")"
resolved_trash="$(realpath "$TRASH_ROOT")"
expected_trash="$resolved_storage/.mycloud_trash"

if [ "$resolved_trash" != "$expected_trash" ] || [ "$resolved_trash" = "/" ]; then
  log "refusing to purge unexpected trash path: $resolved_trash"
  exit 1
fi

item_count="$(find "$resolved_trash" -mindepth 1 -maxdepth 1 | wc -l)"
find "$resolved_trash" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +

if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" "DELETE FROM trash_items;"
else
  log "database not found while purging trash: $DB_PATH"
fi

log "purged $item_count trash item(s) from $resolved_trash"
