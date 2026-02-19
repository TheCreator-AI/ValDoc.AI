# Audit Trail

The application writes append-only security events to `AuditEvent` for:
- login/logout (`auth.login.*`, `auth.logout`)
- authorization denials (`authz.denied`)
- template create/update/delete/approve
- document generation endpoints
- export/download endpoints
- user role changes
- upload/delete operations for governed files

## Data Captured
- `timestamp`
- `actorUserId` (user_id)
- `action`
- `entityType` (object_type)
- `entityId` (object_id)
- `outcome` (`SUCCESS` or `DENIED`)
- `metadataJson` (JSON metadata)
- `ip`
- `userAgent`
- `prevHash`
- `eventHash`

## Immutability
- DB triggers block `UPDATE` and `DELETE` on `AuditEvent`.
- DB triggers block `UPDATE` and `DELETE` on `AuditEventDetail`.
- Application routes do not expose audit update/delete operations.

## Tamper-Evident Hash Chain
- `AuditEvent.prevHash` stores the previous event hash for the organization chain.
- `AuditEvent.eventHash` is computed as:
  - `SHA-256(prevHash + canonical_event_payload)`
- Canonical payload includes organization/user/action/entity/outcome/metadata/ip/user-agent/timestamp.
- Chain head is stored in `AuditChainHead.headHash`.
- Verification endpoint:
  - `GET /admin/audit/verify-chain` (alias: `GET /api/admin/audit/verify-chain`)
  - returns pass/fail and first broken event id.

## Time Integrity
- Regulated event timestamps are generated server-side (UTC) and never accepted from client payloads.
- Display layers may convert for user locale, but persisted values remain UTC/ISO 8601.
- Admin can review runtime time assumptions via `GET /api/admin/system-time-status`.

## Operational DB Controls
- App DB role should have:
  - `INSERT` on `AuditEvent`, `AuditEventDetail`, `AuditChainHead`
  - `SELECT` on audit tables
- App DB role should not have:
  - `UPDATE`/`DELETE` permissions on `AuditEvent` and `AuditEventDetail`
- For SQLite MVP, trigger-based immutability enforces append-only behavior.
- For production RDBMS, enforce least-privilege grants in addition to triggers/policies.

## Retention Notes
Configured via environment:
- `AUDIT_RETENTION_DAYS`

Retention settings are visible through the export configuration endpoint/UI.

## Sample Query Export
SQLite example:

```sql
SELECT
  timestamp,
  actorUserId,
  action,
  entityType,
  entityId,
  outcome,
  metadataJson,
  ip,
  userAgent
FROM AuditEvent
ORDER BY timestamp DESC
LIMIT 25;
```
