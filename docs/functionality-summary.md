# ValDoc.AI Functionality Summary

## Overview
ValDoc.AI is a single-tenant validation document automation system for GMP workflows. It ingests source evidence, stores structured equipment/unit data, generates controlled draft documents, enforces review/approval/signature controls, and exports compliance evidence.

This deployment is configured by environment (`CUSTOMER_ID`, `ORG_NAME`) and login organization selection is constrained to that deployment organization.

## Primary Functional Areas
1. Authentication and access control
- Email/password login, session cookies, lockout controls, password age policy.
- RBAC with backend enforcement for `ADMIN`, `USER`, `REVIEWER`, `APPROVER`, `VIEWER` (legacy `AUTHOR`/`ENGINEER` map to `USER`).
- Server-side permission checks on protected routes.

2. Equipment and unit management
- Admin-controlled equipment creation/deletion.
- Unit records with metadata (serial number, location, procurement/calibration dates, PM plan).
- Unit grouping and unit-level executed document tracking.
- Equipment-level setpoints (facts) that apply across units of the same machine type.

3. Document and template management
- Upload and store source documents and templates.
- Template lifecycle with versioning and status workflow (`DRAFT`, `APPROVED`, `RETIRED`).
- Approved-template-only generation behavior for controlled flows.

4. Generation pipeline (deterministic)
- URS generation from intended use + equipment setpoints.
- RA generation from URS with deterministic scoring and taxonomy controls.
- IOQ/OQ generation from URS + RA.
- Traceability matrix generation (`Requirement -> Risk Control -> Test Case`).
- Quality gates before ready-for-export states.

5. Review, signatures, and lifecycle
- Document versions with lifecycle state machine (`DRAFT -> IN_REVIEW -> APPROVED -> OBSOLETE`).
- Electronic signatures with password re-authentication and role/meaning enforcement.
- Two-person rule and emergency override controls (config-driven).

6. Export and evidence
- Document export as DOCX/PDF and package ZIP.
- Integrity verification endpoints for document versions and exported artifacts.
- Admin evidence package export with manifest and per-artifact hashes.

7. Audit and compliance controls
- Append-only audit trail with field-level change details.
- Tamper-evident audit hash chaining + verification endpoint.
- Security posture/status endpoint for operational control visibility.
- Retention policy, legal hold, and purge workflow with signed report generation.

## Database Model (High-Level)
1. Tenant/system
- `Organization`, `DeploymentConfig`, `DeploymentRole`, `User`, `UserSession`

2. Equipment and evidence
- `Machine`, `Unit`, `UnitGroup`, `EquipmentFact`
- `SourceDocument`, `SourceChunk`
- `MachineVendorDocument`, `UnitExecutedDocument`

3. Documents and control
- `DocumentTemplate`, `GenerationJob`, `GeneratedDocument`
- `DocumentVersion`, `TraceabilityLink`
- `ElectronicSignature`

4. Compliance and operations
- `AuditEvent`, `AuditEventDetail`, `AuditChainHead`
- `RetentionPolicy`, `LegalHold`, `RetentionPurgeRun`
- `AccessReviewReport`, `AppRelease`

## Compliance-Critical Behaviors
- Approved versions are immutable.
- Regulated records avoid hard delete; soft-delete + audit used where applicable.
- Signature records are cryptographically linked to signed content.
- Security events and denied actions are auditable.
- Exported artifacts include metadata, hashes, and traceability references.

## Operational Notes
- Startup fails fast when required configuration is missing.
- Dev/start/build run config validation.
- For Windows developer workflows, persistent env vars can be set with `setx` to avoid repeating session exports.
