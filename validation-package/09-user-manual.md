# ValDoc.AI User Manual

Document ID: `VALDOC-SYS-UM`  
Version: `1.0`  
Status: `Controlled`

## 1. Purpose
Provide end-to-end user instructions for operating ValDoc.AI across setup, document management, generation, review, export, and compliance workflows.

## 2. Role Overview
- Admin: manages organizations, users/roles, releases, retention/legal hold, audit and evidence exports.
- Author/User: creates/updates content in allowed states and runs generation flows.
- Reviewer/Approver: reviews, signs, approves per policy.
- Viewer: read-only access to permitted views.

## 3. Sign In and Session Basics
1. Open the application URL.
2. Select organization (if prompted).
3. Enter credentials and sign in.
4. If login failures occur, warnings appear near lockout threshold.
5. Use Sign Out after completion.

## 4. Equipment and Unit Management
1. Go to **View Equipment and Units**.
2. Create/select equipment (Admin-controlled where configured).
3. Add/edit units and assign groups.
4. Maintain unit metadata (serial, location, procurement/calibration/PM details).
5. Use collapsible folders for setpoints/facts and unit-level documents.

## 5. Document and Template Management
1. Go to **Manage Documents**.
2. Upload source documents and executed documents to appropriate areas.
3. In template areas, upload approved template examples by document type.
4. Verify uploaded items appear in the database list and open/download correctly.

## 6. Generation Workflows
1. Select equipment.
2. Run generation for required document types (URS, RA, IOQ/OQ, TM, etc.).
3. Confirm generated outputs include traceability links.
4. Review generated content and quality-gate status before export.

## 7. Review, Versioning, and Approval
1. Open document history.
2. Create new version for updates/corrections (include change reason).
3. Transition through lifecycle states according to policy.
4. Use signing actions with password re-authentication where required.
5. After approval, document versions become immutable.

## 8. Exporting Documents
1. Export document/package as DOCX/PDF/ZIP from the export controls.
2. Confirm output includes metadata, traceability, and signature references where applicable.
3. Use integrity verify endpoints for critical exports.

## 9. Audit, Evidence, and Integrity
- Audit logs:
  - View/filter by date and action.
  - Verify audit chain integrity using admin endpoint.
- Evidence package:
  - Generate from `POST /api/admin/evidence/export?date_from&date_to`.
  - Review `index.md` and `manifest.json` in bundle.
- Hash verification:
  - Verify document versions and exported artifacts via dedicated endpoints.

## 10. Release Registry and Change Control
1. Admin creates a release entry with build version, summary, and risk impact.
2. Update entry before approval if needed.
3. Sign/approve release with password re-authentication.
4. Export release history report as CSV for records.

## 11. Backup and Restore Operations
1. Run backup utility with encryption key configured.
2. Run restore verification harness in non-production environment.
3. Store logs/artifacts as objective evidence.

## 12. Troubleshooting
- `403 Insufficient permissions`: confirm role assignment and organization context.
- `401 Authentication required`: sign in again or check session timeout.
- Upload rejection: verify allowed file type and size.
- Export errors: check document status and quality gate results.

## 13. Operational Command Reference
```bash
npm test
npm run lint
npm run typecheck
npm run security:audit
npm run security:sast
npm run secrets:scan
npm run db:generate
```
