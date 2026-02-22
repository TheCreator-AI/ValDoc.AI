# Cross-Organization API Coverage

Policy:
- ID-based cross-organization access returns `404` (resource not found in caller org scope).
- Permission failures return `403`.
- List endpoints must only return objects in the caller organization.

Primary suites:
- `src/test/api-regression/cross-org-api-groups.test.ts`
- `src/test/api-regression/cross-org-admin-endpoints.test.ts`

Covered route groups from `docs/api-definitions.md`:
- Equipment and uploads:
  - `GET /api/machines` (list scoped)
  - `GET /api/search?q=...` (search scoped to caller org)
- Generation:
  - `POST /api/generation/start` (cross-org machine -> 404)
  - `GET /api/generation/{jobId}` (cross-org job -> 404)
  - `GET /api/jobs` (list scoped)
  - `POST /api/equipment/{id}/generate/ioq` (cross-org machine -> 404)
  - `POST /api/equipment/{id}/generate/oq` (cross-org machine -> 404)
  - `POST /api/equipment/{id}/generate/trace` (cross-org machine -> 404)
  - `POST /api/urs/{id}/generate/ra` (cross-org document -> 404)
- Change control:
  - `GET /api/lab-groups` (list scoped)
  - `GET /api/change-controls` (list scoped)
  - `POST /api/change-controls/{changeControlId}/approve` (cross-org id -> 404)
- Review and lifecycle:
  - `POST /api/review/{documentId}/version` (cross-org id -> 404)
  - `POST /api/review/{documentId}/decision` (cross-org id -> 404)
  - `GET /api/documents/{id}/versions` (cross-org id -> 404)
  - `POST /api/documents/{id}/versions` (cross-org id -> 404)
  - `POST /api/documents/{id}/versions/{versionId}/transition` (cross-org id -> 404)
  - `POST /api/records/{type}/{id}/versions/{versionId}/sign` (cross-org id -> 404)
- Export:
  - `GET /api/export/{jobId}?format=zip` (cross-org id -> 404)
  - `GET /api/export/{jobId}?format=docx&documentId=...` (cross-org id -> 404)
  - `GET /api/export/{jobId}?format=pdf&documentId=...` (cross-org id -> 404)
- Audit verification:
  - `GET /api/admin/audit/verify-chain` (query scoped to caller org)
- Admin endpoints (retention/access review/releases):
  - `GET /api/admin/access-reviews/reports` (list scoped)
  - `GET /api/admin/access-reviews/reports/{reportId}/download` (cross-org id -> 404)
  - `GET /api/admin/retention/config` (scoped config read)
  - `GET /api/admin/retention/legal-holds` (list scoped)
  - `POST /api/admin/retention/legal-holds/{holdId}/release` (cross-org id -> 404)
  - `GET /api/admin/releases` (list scoped)
  - `PATCH /api/admin/releases/{releaseId}` (cross-org id -> 404)
  - `POST /api/admin/releases/{releaseId}/sign` (cross-org id -> 404)
  - `GET /api/admin/releases/export` (export generated from caller org rows only)
