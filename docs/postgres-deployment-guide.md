# Postgres Deployment Guide (Enterprise)

This repository ships a Postgres-compatible Prisma schema and migration set for enterprise deployments.

## 1) Prisma Postgres Schema + Migrations
- Schema: `prisma/schema.postgres.prisma`
- Baseline migration: `prisma/postgres/migrations/0001_init/migration.sql`

Use the Postgres-specific Prisma commands:
- `npm run db:migrate:status:postgres`
- `npm run db:migrate:deploy:postgres`

## 2) Database Roles
Role SQL: `scripts/postgres/roles-and-grants.sql`

Defined roles:
- `valdoc_app`: runtime app role
- `valdoc_admin`: restricted admin role

Security posture:
- Both roles are explicitly blocked from `UPDATE/DELETE` on:
  - `AuditEvent`
  - `AuditEventDetail`
  - `ElectronicSignature`

This supports append-only audit/signature controls at DB permissions level.

## 3) Apply Roles/Grants
Run after schema migration using a privileged DB account:

```bash
psql "$DATABASE_URL" -f scripts/postgres/roles-and-grants.sql
```

## 4) Postgres Docker Compose for Test Runs
Compose file: `docker-compose.postgres.yml`

Start DB:
```bash
docker compose -f docker-compose.postgres.yml up -d postgres
```

Run tests against Postgres (profile):
```bash
docker compose -f docker-compose.postgres.yml --profile test up --build pg-test
```

## 5) Recommended Runtime Credentialing
- Use separate credentials per role.
- App should connect using `valdoc_app`.
- Keep admin credentials out of app runtime and CI except migration jobs.
- Store credentials in a secrets manager.
