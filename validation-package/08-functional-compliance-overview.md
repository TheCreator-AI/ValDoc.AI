# ValDoc.AI Functional and Compliance Overview

Document ID: `VALDOC-SYS-FCO`  
Version: `1.0`  
Status: `Controlled`

## 1. Purpose
Provide a consolidated description of platform functionality and explain the controls that support compliant operation in regulated workflows.

## 2. Functional Capabilities
- Authentication and deployment-organization-scoped access control (single-tenant per instance).
- Role-based authorization for Admin/Author/Reviewer/Approver/Viewer operations.
- Equipment and unit management, including grouped units and metadata.
- Controlled upload and storage of templates, source documents, and executed documents.
- Deterministic generation pipeline for URS, RA, IOQ/OQ, TM, and summary artifacts.
- Document lifecycle/version control (Draft -> In Review -> Approved -> Obsolete).
- Review workflow, approvals, and e-signature support.
- Export to DOCX/PDF/ZIP with metadata and traceability references.
- Evidence export package generation for objective audit support.

## 3. Compliance-Enabling Controls

### 3.1 Access and Segregation Controls
- Server-side RBAC enforcement on protected endpoints.
- Organization scoping in server queries.
- Two-person rule for final approval where configured.
- Admin-only operations for sensitive functions (audit access, release controls, retention operations).

### 3.2 Record Integrity and Immutability
- Approved records are immutable; changes require new version creation.
- Regulated deletes use soft-delete with reason and audit trace.
- SHA-256 hashes stored for document versions and exports.
- Integrity verification endpoints detect tampering or drift.

### 3.3 Audit and Traceability
- Append-only audit event model with DB-level update/delete prevention triggers.
- Field-level change details for regulated modifications.
- Tamper-evident audit hash chain with verification endpoint.
- End-to-end requirement/risk/test traceability support.

### 3.4 Electronic Signatures
- Signature captures signer identity, meaning, timestamp, and record hash.
- Password re-authentication required at signing time.
- Signature manifest cryptographically linked to signed record content.

### 3.5 Operational Controls
- Startup configuration validation with fail-fast behavior.
- Backup/restore and integrity verification utilities.
- Retention/legal hold controls.
- CI security gates (tests, lint/typecheck, dependency audit, SAST, secrets scanning).

## 4. Compliance Mapping Summary
- 21 CFR Part 11 alignment areas covered:
  - User accountability and role control.
  - Electronic signatures linked to records.
  - Audit trails and record integrity.
  - Controlled versioning and lifecycle state management.
- GMP-aligned process controls:
  - Change control and release history.
  - Objective evidence generation and reproducibility.

## 5. Safety and Risk Reduction Features
- Unauthorized actions are denied and auditable.
- High-risk workflow steps require role-specific controls and signatures.
- Integrity checks expose data tampering quickly.
- Security gates reduce deployment risk from known vulnerabilities and static issues.

## 6. Supporting Evidence Commands
```bash
npm test
npm run lint
npm run typecheck
npm run security:audit
npm run security:sast
npm run secrets:scan
```

Operational verification endpoints:
- `GET /api/admin/audit/verify-chain`
- `GET /api/documents/{id}/versions/{versionId}/verify`
- `GET /api/documents/{id}/exports/{exportId}/verify`
- `POST /api/admin/evidence/export?date_from&date_to`
