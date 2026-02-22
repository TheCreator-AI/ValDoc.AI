# Architecture & Trust Boundaries

## Scope
This map documents core trust boundaries and enforcement points for authentication, tenant scoping, regulated record lifecycle, audit integrity, e-signatures, uploads, and exports.

## High-Level Diagram
```text
Browser UI
  |
  | HTTPS + session cookie (valdoc_token)
  v
Next.js Route Handlers (src/app/api/**/route.ts)
  |
  |--> Auth/session verification + RBAC checks
  |     - src/server/api/http.ts
  |     - src/server/auth/token.ts
  |     - src/server/auth/rbac.ts
  |
  |--> Domain services (generation/review/signature/retention/evidence)
  |     - src/server/**/*
  |
  |--> Prisma data layer
  |     - src/server/db/prisma.ts
  |     - prisma/schema.prisma
  |
  |--> File storage (private path, UUID names)
  |     - src/server/files/storage.ts
  |
  |--> Audit chain + optional external sink
        - src/server/audit/events.ts
        - src/server/audit/chain.ts
        - src/server/audit/sink.ts
```

## Trust Boundaries
1. Client -> API boundary
- Untrusted: request body, query params, filenames, client timestamps.
- Trusted only after: auth/session verification + server-side authorization + validation.

2. API -> Database boundary
- Prisma access through `src/server/db/prisma.ts`.
- Regulated immutability/append-only controls enforced in bootstrap triggers (`src/server/db/bootstrap.ts`).

3. API -> File storage boundary
- Upload validation and safe storage in `src/server/files/storage.ts`.
- Malware scan hook in `src/server/files/malwareScan.ts`.

4. Audit trail boundary
- All security-relevant events written through `writeAuditEvent` (`src/server/audit/events.ts`).
- Hash chain verification via `verifyAuditChain` (`src/server/audit/chain.ts`).

## Component Map (with file paths)
### Auth/session creation and verification
- Login route: `src/app/api/auth/login/route.ts`
- Logout route: `src/app/api/auth/logout/route.ts`
- Session token signing/verification: `src/server/auth/token.ts`
- Session cookie creation/clear: `src/server/auth/cookie.ts`
- Session + permission guard helpers: `src/server/api/http.ts`

### organizationId derivation and enforcement
- Session carries `organizationId` (JWT payload) in `src/server/auth/token.ts`.
- Session guard returns session org from cookie token in `src/server/api/http.ts`.
- Route handlers call `getSessionOrThrow` / `getSessionOrThrowWithPermission` in `src/server/api/http.ts`.
- Prisma queries are expected to constrain by `organizationId` from session (examples):
  - `src/app/api/machines/route.ts`
  - `src/app/api/templates/route.ts`
  - `src/app/api/audit-events/route.ts`

### API route handlers
- Route inventory root: `src/app/api/**/route.ts`
- Current full list is discoverable from repository path scan under `src/app/api`.

### Prisma access points
- Prisma client singleton: `src/server/db/prisma.ts`
- Runtime bootstrap/migration/DB safety triggers: `src/server/db/bootstrap.ts`
- Data model: `prisma/schema.prisma`

### File upload pipeline
- Public upload endpoint: `src/app/api/uploads/route.ts`
- Machine/source upload endpoint: `src/app/api/machines/[machineId]/uploads/route.ts`
- Storage/validation: `src/server/files/storage.ts`
- Ingestion and parsing: `src/server/generation/uploadIngest.ts`, `src/server/parsers/pdfParser.ts`

### Audit logging/hashing
- Audit writer: `src/server/audit/events.ts`
- Audit hash chain computation/verification: `src/server/audit/chain.ts`
- Audit details diff engine: `src/server/audit/diff.ts`
- Verify endpoint: `src/app/api/admin/audit/verify-chain/route.ts`

### E-signature flow
- Sign endpoint: `src/app/api/records/[type]/[id]/versions/[versionId]/sign/route.ts`
- Signature policy: `src/server/signatures/policy.ts`
- Signature manifest hash: `src/server/signatures/manifest.ts`
- Signature table: `ElectronicSignature` in `prisma/schema.prisma`

### Export pipeline
- Export route: `src/app/api/export/[jobId]/route.ts`
- DOCX renderer: `src/server/export/defaultDocxRenderer.ts`
- ZIP package export: `src/server/export/packageExporter.ts`
- Evidence export: `src/app/api/admin/evidence/export/route.ts`, `src/server/evidence/exporter.ts`
- Integrity verify endpoints:
  - `src/app/api/documents/[id]/versions/[versionId]/verify/route.ts`
  - `src/app/api/documents/[id]/exports/[exportId]/verify/route.ts`

## Must-Enforce Invariants
1. Organization isolation
- Every read/write must scope to session-derived `organizationId`.
- Client-supplied `organizationId` is never trusted for data access decisions.

2. Regulated immutability
- Approved records are immutable; changes require new version records.
- No hard delete for regulated records; use soft delete + audit where applicable.

3. State machine integrity
- Document lifecycle transitions are constrained by policy:
  - `DRAFT -> IN_REVIEW -> APPROVED -> OBSOLETE`
- Direct/invalid transitions are denied and audited.

4. Audit append-only and tamper-evident
- Audit events/details must be append-only (DB trigger protections).
- Audit chain verification must pass for integrity claims.

5. Signature linkage
- Electronic signatures must include signer identity, meaning, server timestamp, and linked content hash.
- Signature requires password re-authentication.

6. Server-generated time
- Regulated timestamps are server/DB generated; client timestamps ignored.
