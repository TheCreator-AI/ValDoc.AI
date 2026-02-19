param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [string]$DbPath = "storage/db/dev.db",
  [string]$Key = $env:BACKUP_ENCRYPTION_KEY
)

$ErrorActionPreference = "Stop"

if (-not $Key) {
  throw "Missing backup encryption key. Pass -Key or set BACKUP_ENCRYPTION_KEY."
}
$node = "C:\Program Files\nodejs\npm.cmd"
& $node run restore_db -- --backup $BackupFile --db $DbPath --key $Key
