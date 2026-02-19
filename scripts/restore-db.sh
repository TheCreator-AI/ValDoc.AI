#!/usr/bin/env sh
set -eu

BACKUP_FILE="${1:-}"
DB_PATH="${2:-storage/db/dev.db}"
KEY="${3:-${BACKUP_ENCRYPTION_KEY:-}}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: scripts/restore-db.sh <backup-file> [db-path] [key]" >&2
  exit 1
fi

if [ -z "$KEY" ]; then
  echo "Missing backup encryption key. Provide arg #3 or BACKUP_ENCRYPTION_KEY." >&2
  exit 1
fi

npm run restore_db -- --backup "$BACKUP_FILE" --db "$DB_PATH" --key "$KEY"
