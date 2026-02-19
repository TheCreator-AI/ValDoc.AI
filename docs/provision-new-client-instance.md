# Provision New Single-Tenant Client Instance

## 1) Clone Repo
```bash
git clone <your-repo-url> valdoc-ai
cd valdoc-ai
```

## 2) Configure Environment (No Secrets in Repo)
```bash
cp .env.docker.example .env
```

Set required values in `.env`:
- `JWT_SECRET`
- `CUSTOMER_ID`
- `ORG_NAME`
- `BACKUP_ENCRYPTION_KEY`
- optional retention settings:
  - `EXPORT_RETENTION_DAYS`
  - `SOURCE_RETENTION_DAYS`
  - `DOCUMENT_RETENTION_DAYS`
  - `AUDIT_RETENTION_DAYS`
  - `BACKUP_RETENTION_DAYS`
  - `BACKUP_FREQUENCY`

## 3) Start Deployment
```bash
docker compose up -d
```

Optional profiles:
- OpenSearch: `docker compose --profile search up -d`
- MinIO object storage: `docker compose --profile object-storage up -d`

## 4) Run Database Migrations
```bash
docker compose exec app npm run db:generate
docker compose exec app npm run db:migrate:status
docker compose exec app npx prisma migrate deploy --schema prisma/schema.prisma
docker compose exec app npm run db:migrate:status
```

## 5) Provision First Admin + Roles (Recommended)
```bash
docker compose exec app npm run provision -- --admin-email admin@qa.org --admin-name "QA Admin" --admin-password "ChangeMeNow!"
```
This command:
- applies migrations
- writes singleton deployment config (`CUSTOMER_ID`, `ORG_NAME`)
- ensures default roles (`ADMIN`, `USER`, `APPROVER`, `REVIEWER`, plus legacy aliases)
- creates initial admin user (if missing)

Alternative UI bootstrap:
- Open `http://localhost:3000/setup` (or `/` on first run)
- Create first admin user
- Setup is locked after first completion

## 6) Verify Health
```bash
curl http://localhost:3000/api/health
```

Expected:
```json
{"status":"ok","database":"ok","timestamp":"..."}
```

## 7) Backup / Restore Database (Encrypted)

PowerShell:
```powershell
.\scripts\backup-db.ps1 -DbPath storage/db/dev.db -OutputDir backups -Key "<backup-key>"
.\scripts\restore-db.ps1 -BackupFile .\backups\valdoc-db-YYYYMMDD-HHMMSS.backup.enc -DbPath storage/db/dev.db -Key "<backup-key>"
```

Shell:
```bash
./scripts/backup-db.sh storage/db/dev.db backups "<backup-key>"
./scripts/restore-db.sh ./backups/valdoc-db-YYYYMMDD-HHMMSS.backup.enc storage/db/dev.db "<backup-key>"
```

Restore verification (restore into temp DB + integrity checks):
```bash
npm run verify_restore -- --backup backups/valdoc-db-YYYYMMDD-HHMMSS.backup.enc --key "<backup-key>"
```

## 8) Evidence Capture Checklist
- Provisioning log showing admin creation:
```bash
docker compose exec app npm run provision -- --admin-email admin@qa.org --admin-name "QA Admin" --admin-password "ChangeMeNow!"
```
- Environment variable list (without values):
```bash
docker compose exec app sh -lc 'printf "DATABASE_URL\nJWT_SECRET\nCUSTOMER_ID\nORG_NAME\nBACKUP_ENCRYPTION_KEY\nEXPORT_RETENTION_DAYS\nSOURCE_RETENTION_DAYS\nDOCUMENT_RETENTION_DAYS\nAUDIT_RETENTION_DAYS\nBACKUP_RETENTION_DAYS\nBACKUP_FREQUENCY\n"'
```
- Migration status output:
```bash
docker compose exec app npm run db:migrate:status
```

## 9) Rollback
1. Stop app: `docker compose down`
2. Restore known-good backup:
```bash
./scripts/restore-db.sh ./backups/valdoc-db-YYYYMMDD-HHMMSS.backup.enc storage/db/dev.db "<backup-key>"
```
3. Verify migration state:
```bash
docker compose run --rm app npm run db:migrate:status
```
4. Start app: `docker compose up -d`
