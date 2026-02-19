# ValDoc.AI Enterprise MVP

Web-based validation document automation for biotech with organization-scoped RBAC, upload parsing, structured fact extraction, draft generation, review workflow, and export.

## Stack
- Backend/API: Next.js Route Handlers (Node runtime)
- Frontend: React (Next.js App Router)
- Database: Prisma + SQLite (MVP), schema designed for Postgres migration
- Search indexing: SQL chunk index (OpenSearch service included in Docker compose for scale-out path)
- Exports: DOCX, PDF, ZIP

## Enterprise Features Included
- Organization-scoped data isolation (`organizationId` always server-scoped from session org)
- RBAC (`ADMIN`, `USER`, `APPROVER`, `REVIEWER`, `VIEWER`; legacy `AUTHOR`/`ENGINEER` map to `USER`)
- Upload processing for manuals/specs/drawings/SOPs/client criteria/templates
- Citation-aware chunk storage (page + section metadata)
- Equipment fact model extraction JSON
- Staged generation for pre-execution docs (URS/SIA/DIA/RID/IOQ) and post-execution summaries
- Change control module with lab-group impact scoping, risk/system impact, QA approval, and revalidation planning
- Reviewer edit + approve/reject + version history
- Download package as ZIP and documents as DOCX/PDF

## Project Structure
```text
valdoc-ai/
  prisma/
    schema.prisma
    migrations/0001_init/migration.sql
    seed.ts
  docs/
    api-definitions.md
    frontend-screens.md
    functionality-summary.md
  samples/
    sources/sample-manual.txt
    templates/urs-template.md
  src/
    app/
      api/
        auth/login
        auth/me
        machines
        uploads
        generation/start
        generation/[jobId]
        jobs
        review/[documentId]/version
        review/[documentId]/decision
        export/[jobId]
      page.tsx
      globals.css
    components/screens/EnterpriseWorkspace.tsx
    server/
      auth/
      db/
      parsers/
      extract/
      generation/
      workflow/
      export/
      search/
      ai/
```

## Local Setup
1. Install dependencies
```bash
npm install
```

2. Configure env
```bash
cp .env.example .env.local
```
Required variables:
- `DATABASE_URL`
- `JWT_SECRET`
- `CUSTOMER_ID`
- `ORG_NAME`

3. Generate Prisma client
```bash
npm run db:generate
```

4. Create/update DB schema
```bash
npm run db:push
```

5. (Optional) Seed local demo org/user data
```bash
npm run db:seed
```

6. Run app
```bash
npm run dev
```

Open `http://localhost:3000`.
If required env vars are missing/weak, startup fails immediately with a `[config]` validation message.

## First-Time Bootstrap (Single-Tenant)
If the database has no organization and you are using setup UI:
- open `http://localhost:3000/setup`
- create the first admin (organization is bound to `CUSTOMER_ID` / `ORG_NAME`)
- setup is disabled after first successful bootstrap

Recommended provisioning path (non-interactive):
```bash
npm run provision -- --admin-email admin@qa.org --admin-name "QA Admin" --admin-password "ChangeMeNow!"
```
This runs migrations, configures deployment metadata, ensures default roles, and creates initial admin.

Optional local seeded demo user (if `npm run db:seed`):
- `andrew@qa.org` / `Password123!` (ADMIN)

## Full Tutorial
1. Select organization + sign in as `andrew@qa.org`.
2. Create a machine in **Equipment Scope**.
3. Upload one or more files via drag-and-drop (manual, SOP, template, etc.).
4. Click **Process upload** to parse and index source chunks.
5. Click **Generate Pre-Execution (URS to IOQ)**.
6. After protocol execution evidence is uploaded, click **Generate Post-Execution Summaries**.
6. In **Review and Export**:
- open generated docs
- edit content
- save a new version
- approve/reject as reviewer
7. Download:
- per-document DOCX/PDF
- full package ZIP

## API Summary
- `POST /api/auth/login`
- `GET /api/auth/organizations`
- `GET /api/auth/me`
- `GET /api/health`
- `GET /api/setup/status`
- `POST /api/setup/bootstrap`
- `GET /api/configuration/export`
- `GET/POST /api/machines`
- `POST /api/uploads`
- `POST /api/generation/start`
- `GET /api/generation/{jobId}`
- `GET /api/jobs`
- `POST /api/review/{documentId}/version`
- `POST /api/review/{documentId}/decision`
- `POST /api/documents/{id}/versions`
- `POST /api/documents/{id}/versions/{versionId}/transition`
- `GET /api/documents/{id}/versions/{versionId}/verify`
- `GET /api/documents/{id}/exports/{exportId}/verify`
- `GET /api/admin/audit/verify-chain`
- `GET/POST /api/admin/organizations`
- `DELETE /api/admin/organizations/{organizationId}`
- `GET /api/admin/system-time-status`
- `POST /api/admin/evidence/export?date_from&date_to`
- `GET/POST /api/admin/releases`
- `PATCH /api/admin/releases/{releaseId}`
- `POST /api/admin/releases/{releaseId}/sign`
- `GET /api/admin/releases/export`
- `GET/PUT /api/admin/retention/config`
- `GET/POST /api/admin/retention/legal-holds`
- `POST /api/admin/retention/legal-holds/{holdId}/release`
- `POST /api/admin/retention/purge`
- `GET /api/admin/retention/purge/{runId}/download`
- `GET /api/export/{jobId}?format=zip|docx|pdf`

Full endpoint notes: `docs/api-definitions.md`.

## Testing and Quality Gates
Run all checks:
```bash
npm test
npm run lint
npm run typecheck
npm run secrets:scan
```

Security checks (same gates as CI):
```bash
npm run security:audit
npm run security:sast
npm run secrets:scan
```

Local tool prerequisites for full security checks:
- `semgrep` must be installed and available on PATH.
- `gitleaks` must be installed and available on PATH.

Run all security gates together:
```bash
npm run security:check
```

Config validation command:
```bash
npm run config:check
```

## Retention And Legal Hold
- Retention policy is configurable per deployment org in **Export Configuration**.
- `audit_event` retention is advisory/report-only because audit records are append-only and hash-chained.
- Generated documents and document versions are soft-purged (`deletedAt`) when retention applies and no active legal hold exists.
- Legal holds block purge for:
  - `GENERATED_DOCUMENT`
  - `DOCUMENT_VERSION`
- Purge is admin-triggered only and creates a signed JSON report downloadable from:
  - `/api/admin/retention/purge/{runId}/download`

The following scripts run config validation before startup:
- `npm run dev`
- `npm run build`
- `npm run start`

## Secure File Handling
- Allowed upload extensions: `.pdf`, `.doc`, `.docx`, `.txt` (per upload kind limits).
- File signatures are validated (magic bytes / structural checks) before write; extension and file content must match.
- Browser-provided content-type is treated as untrusted and must align with detected content when present.
- Size limits are enforced server-side by upload category.
- Stored files use UUID filenames and are written under private storage (`storage/uploads`) outside public web routes.
- Path traversal is blocked with filename sanitization and storage-root path validation.
- Malware scanning hook is built in via `src/server/files/malwareScan.ts` (default local stub; replace for production scanner integration).
- Download routes enforce session/org authorization and emit audit events for both successful and denied download attempts.

## End-to-End Pipeline (Single-Tenant P3)
- Endpoint: `POST /api/equipment/{id}/generate/pipeline`
- Input:
  - `intendedUse` (string)
  - `selectedDocTypes` (optional array: `URS`, `RID`, `IOQ`, `OQ`, `TRACEABILITY`)
- Pipeline order:
  1. URS (schema-driven from equipment facts + intended use)
  2. RA (stored as `RID`) from URS
  3. IOQ/OQ from URS + RA
  4. Traceability Matrix
  5. Quality Gate evaluation
  6. DOCX export allowed only when gate passes
- Every generated document is versioned and hashed; links are persisted via traceability mappings and citations metadata.
- Manual walkthrough: `docs/demo-pipeline-script.md`

## Docker Compose (Single-Tenant Package)
```bash
cp .env.docker.example .env
docker compose up -d
```
Starts:
- app (`localhost:3000`)
- sqlite db sidecar volume service (`db`)
- optional OpenSearch profile: `docker compose --profile search up -d`
- optional MinIO profile: `docker compose --profile object-storage up -d`

Health endpoint:
```bash
curl http://localhost:3000/api/health
```

Backup / restore scripts:
```powershell
.\scripts\backup-db.ps1 -DbPath storage/db/dev.db -OutputDir backups -Key "<encryption-key>"
.\scripts\restore-db.ps1 -BackupFile .\backups\valdoc-db-YYYYMMDD-HHMMSS.backup.enc -DbPath storage/db/dev.db -Key "<encryption-key>"
```

Encrypted backup/restore (recommended):
```powershell
& "C:\Program Files\nodejs\npm.cmd" run backup_db -- --db storage/db/dev.db --out backups --key "<encryption-key>"
& "C:\Program Files\nodejs\npm.cmd" run restore_db -- --backup backups/valdoc-db-YYYYMMDD-HHMMSS.backup.enc --db storage/db/dev.db --key "<encryption-key>"
& "C:\Program Files\nodejs\npm.cmd" run verify_restore -- --backup backups/valdoc-db-YYYYMMDD-HHMMSS.backup.enc --key "<encryption-key>"
```

Evidence sample:
- `docs/backup-restore-evidence.log`

Provisioning guide:
- `docs/provision-new-client-instance.md`
- `docs/permission-matrix.md`
- `docs/audit-trail.md`

## Rollback Steps
1. Stop app/container.
2. Restore DB from backup:
```powershell
.\scripts\restore-db.ps1 -BackupFile .\backups\valdoc-db-YYYYMMDD-HHMMSS.backup.enc -DbPath storage/db/dev.db -Key "<encryption-key>"
```
3. Re-run migrations status check:
```bash
npm run db:migrate:status
```
4. Restart app:
```bash
npm run dev
```

## Prompt Structures
Prompt templates for extraction and generation are in:
- `src/server/ai/prompts.ts`

They enforce:
- citation-required factual output
- strict schema-oriented extraction
- template-constrained generation
- traceability row production

## Schema Versioning
Canonical JSON schemas for validation documents live in `schemas/`:
- `schemas/urs.v1.json`
- `schemas/ra.v1.json`
- `schemas/ioq.v1.json`
- `schemas/oq.v1.json`
- `schemas/tm.v1.json`

Versioning rule:
- Add a new file for a breaking schema change (example: `urs.v2.json`).
- Keep old versions immutable for audit/replay compatibility.
- Select schema explicitly in code via `src/server/schemas/validator.ts`.

## Document Lifecycle State Machine
- Version states: `DRAFT -> IN_REVIEW -> APPROVED -> OBSOLETE`
- Direct `DRAFT -> APPROVED` transition is blocked.
- `APPROVED` versions are immutable (no edits/deletes).
- New edits create a new successor version and require a `change_reason`.
- Obsoleting a version requires either:
  - replacement version reference, or
  - explicit justification (controlled by `ALLOW_OBSOLETE_WITH_JUSTIFICATION`, default `true`).
- Segregation of duties:
  - `ENFORCE_TWO_PERSON_RULE=true` blocks same-user author+final-approver.
  - admin override is only available if `EMERGENCY_APPROVAL_OVERRIDE_ENABLED=true` and justification is provided.
  - override events are logged under dedicated audit actions.

## Section Skeleton Library
Neutral internal section skeletons are in `content/skeletons/`:
- `urs.v1.json`
- `ra.v1.json`
- `ioq.v1.json`
- `oq.v1.json`
- `summary-report.v1.json`

Each skeleton defines section order, headings, schema field mappings (`populate_from`), and default table layouts.

## Notes for Production Hardening
- Move from SQLite to Postgres and managed object storage.
- Use enterprise SSO (OIDC/SAML) and rotate JWT signing keys.
- Add immutable audit-event ledger and e-signature workflow.
- Add asynchronous job queue and retry policy.
- Replace heuristic extraction/generation with governed LLM pipeline and validation checks.
