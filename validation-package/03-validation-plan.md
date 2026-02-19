# ValDoc.AI Software Validation Plan

Document ID: `VALDOC-SYS-VP`  
Version: `1.0`  
Status: `Draft`  

## 1. Objective
Define the strategy, responsibilities, and deliverables for validating ValDoc.AI as a regulated-support software system.

## 2. Validation Scope
- Authentication and authorization controls.
- Audit trail and audit chain verification.
- Electronic signatures and lifecycle controls.
- Document generation, export, and integrity verification.
- Backup, restore, and operational security checks.

## 3. Deliverables
- System URS
- System Risk Assessment
- IQ Protocol
- OQ Protocol
- Traceability Matrix
- Validation Summary Report Template

## 4. Roles and Responsibilities
- Validation Lead: owns plan execution and evidence collection.
- QA Reviewer: reviews protocols, deviations, and summary conclusions.
- Approver: approves final validation records and release decision.
- System Admin: executes IQ deployment checks and operational controls.

## 5. Test Strategy
- IQ verifies installation/configuration and environment controls.
- OQ verifies functional behavior and security/compliance controls.
- Automated tests and CI gates provide repeatable evidence.

## 6. Acceptance Criteria
- All high-criticality URS requirements have passing mapped test evidence.
- No unresolved critical deviations.
- Audit integrity chain verification passes.
- Integrity verify endpoints return expected results for untampered records.

## 7. Deviation Handling
- Record deviation ID, description, impact, corrective action, and closure evidence.
- Re-test affected controls after corrective action.

## 8. Change Control
- Validation-impacting software changes require documented impact assessment.
- Re-validation depth is risk-based using URS/RA/TM impact.

## 9. How To Produce Evidence
Run from repository root:

```bash
npm test
npm run lint
npm run typecheck
npm run security:audit
npm run security:sast
npm run secrets:scan
```

Operational evidence:
- Export audit chain check: `GET /api/admin/audit/verify-chain`
- Verify record hash: `GET /api/documents/{id}/versions/{versionId}/verify`
- Verify export hash: `GET /api/documents/{id}/exports/{exportId}/verify`
- Backup/restore evidence from scripts and logs in `scripts/`.
