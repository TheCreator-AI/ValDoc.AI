#!/usr/bin/env sh
set -eu

DB_PATH="${1:-storage/db/dev.db}"
OUTPUT_DIR="${2:-backups}"
KEY="${3:-${BACKUP_ENCRYPTION_KEY:-}}"

if [ -z "$KEY" ]; then
  echo "Missing backup encryption key. Provide arg #3 or BACKUP_ENCRYPTION_KEY." >&2
  exit 1
fi

npm run backup_db -- --db "$DB_PATH" --out "$OUTPUT_DIR" --key "$KEY"
