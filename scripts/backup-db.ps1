param(
  [string]$DbPath = "storage/db/dev.db",
  [string]$OutputDir = "backups",
  [string]$Key = $env:BACKUP_ENCRYPTION_KEY
)

$ErrorActionPreference = "Stop"

if (-not $Key) {
  throw "Missing backup encryption key. Pass -Key or set BACKUP_ENCRYPTION_KEY."
}
$node = "C:\Program Files\nodejs\npm.cmd"
& $node run backup_db -- --db $DbPath --out $OutputDir --key $Key
