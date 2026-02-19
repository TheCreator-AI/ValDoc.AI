# API Definitions

## Authentication
- `POST /api/auth/login`
- `GET /api/auth/me`

RBAC matrix:
- `docs/permission-matrix.md`

## Multi-tenant Data
- Every request is scoped by `organizationId` from the signed session cookie.
- Cross-tenant access is blocked by `where: { organizationId: session.organizationId }` filters.

## Equipment and Uploads
- `GET /api/machines`
- `POST /api/machines`
- `POST /api/uploads` (`multipart/form-data`: `machineId`, `sourceType`, `file`)

## Generation
- `POST /api/generation/start` body: `{ "machineId": "...", "phase": "pre_execution|post_execution" }`
- `GET /api/generation/{jobId}`
- `GET /api/jobs`
- `POST /api/equipment/{id}/generate/pipeline` body:
  - `{ "intendedUse": "...", "selectedDocTypes": ["URS","RID","IOQ","OQ","TRACEABILITY"] }`
- `POST /api/equipment/{id}/generate/ioq`
- `POST /api/equipment/{id}/generate/oq`
- `POST /api/equipment/{id}/generate/trace`
- `POST /api/urs/{id}/generate/ra`

## Change Control
- `GET /api/lab-groups`
- `POST /api/lab-groups`
- `GET /api/change-controls`
- `POST /api/change-controls`
- `POST /api/change-controls/{changeControlId}/approve`

## Review
- `POST /api/review/{documentId}/version` body: `{ "content": "...", "comment": "..." }`
- `POST /api/review/{documentId}/decision` body: `{ "decision": "APPROVED|REJECTED" }`
- `POST /api/documents/{id}/versions` body:
  - `{ "content_json": "...", "change_reason": "..." }`
  - creates a successor draft version from latest
- `POST /api/documents/{id}/versions/{versionId}/transition` body:
  - `{ "to_state": "DRAFT|IN_REVIEW|APPROVED|OBSOLETE", "replacement_version_id": "optional", "justification": "optional", "emergency_override": "optional boolean", "override_justification": "optional string" }`
  - enforces lifecycle transition rules
- `POST /api/templates/{templateId}/approve`
- `POST /api/records/{type}/{id}/versions/{versionId}/sign`
  - body: `{ "meaning": "AUTHOR|REVIEW|APPROVE", "password": "...", "remarks": "optional", "emergency_override": "optional boolean", "override_justification": "optional string" }`
  - supported `type`: `generated-document`
  - enforces password re-authentication and latest-version-only signing

## Audit Chain Verification
- `GET /api/admin/audit/verify-chain`
- `GET /admin/audit/verify-chain` (alias)
  - Admin/audit.read only
  - returns pass/fail, first broken event id, and checked event count

## System Time Status
- `GET /api/admin/system-time-status`
  - Admin/audit.read only
  - returns server UTC time, app timezone config, and NTP sync status/assumption

## Security Status
- `GET /api/admin/security-status`
  - Admin only (`organizations.manage`)
  - returns summarized deployment hardening posture (MFA requirement, two-person rule, audit chain head presence, audit sink configuration status)

## Retention and Legal Hold
- `GET /api/admin/retention/config`
- `PUT /api/admin/retention/config`
  - Admin only
  - body: `{ "auditEventRetentionDays": number|null, "documentVersionRetentionDays": number|null, "legalHoldEnabled": boolean }`
- `GET /api/admin/retention/legal-holds`
- `POST /api/admin/retention/legal-holds`
  - Admin only
  - body: `{ "recordType": "GENERATED_DOCUMENT|DOCUMENT_VERSION", "recordId": "...", "recordVersionId": "optional", "reason": "optional" }`
- `POST /api/admin/retention/legal-holds/{holdId}/release`
  - Admin only
  - body: `{ "reason": "optional" }`
- `POST /api/admin/retention/purge`
  - Admin only
  - body: `{ "dryRun": true|false }` (defaults to true)
  - writes signed purge report + audit event
- `GET /api/admin/retention/purge/{runId}/download`
  - Admin only
  - downloads signed JSON purge report

## Export
- `GET /api/export/{jobId}?format=zip`
- `GET /api/export/{jobId}?format=docx&documentId=...`
- `GET /api/export/{jobId}?format=pdf&documentId=...`
