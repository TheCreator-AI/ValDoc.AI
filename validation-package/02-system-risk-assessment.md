# ValDoc.AI Software System Risk Assessment

Document ID: `VALDOC-SYS-RA`  
Version: `1.0`  
Status: `Draft`  

## 1. Purpose
Assess software risks associated with ValDoc.AI system operation and define risk controls and verification mappings.

## 2. Risk Scoring
- Severity (S): 1-5
- Occurrence (O): 1-5
- Detection (D): 1-5
- Initial Risk Score: `S * O * D`
- Residual Risk: assessed after controls are applied and verified.

## 3. Risk Register

| Risk ID | Hazard | Cause | Impact | S | O | D | Initial Risk | Controls | Residual Risk | Linked URS | Verification |
|---|---|---|---|---:|---:|---:|---:|---|---:|---|---|
| RA-SYS-001 | Unauthorized access | Missing/weak authorization checks | Data manipulation or disclosure | 5 | 2 | 2 | 20 | Server-side RBAC checks, route guards, denied-action auditing | 6 | URS-SYS-001, URS-SYS-010 | OQ-SEC-001, OQ-SEC-002 |
| RA-SYS-002 | Account compromise | Weak auth/session controls | Unauthorized use of regulated functions | 5 | 2 | 2 | 20 | Lockout, session timeout, password policy, secure cookies | 8 | URS-SYS-002 | OQ-SEC-003, OQ-SEC-004 |
| RA-SYS-003 | Audit tampering | Mutable audit log implementation | Loss of evidentiary integrity | 5 | 1 | 3 | 15 | Append-only event model, hash chain verification, restricted operations | 5 | URS-SYS-003 | OQ-COMP-001, OQ-COMP-002 |
| RA-SYS-004 | Invalid signature attribution | Signature without re-authentication or record linkage | Non-compliant approvals | 5 | 2 | 2 | 20 | Password re-auth for signing, signature manifest hash linkage | 6 | URS-SYS-004 | OQ-COMP-003 |
| RA-SYS-005 | Uncontrolled record edits | Editing approved versions | Invalidated approved records | 5 | 2 | 2 | 20 | Lifecycle state enforcement, immutable approved versions | 5 | URS-SYS-005, URS-SYS-006 | OQ-FUNC-005 |
| RA-SYS-006 | Loss of historical trace | Hard delete of regulated content | Missing historical evidence | 4 | 2 | 3 | 24 | Soft delete with reason and audit logging | 7 | URS-SYS-008 | OQ-COMP-004 |
| RA-SYS-007 | Data tampering undetected | Missing content hash checks | Undetected record corruption | 5 | 2 | 3 | 30 | SHA-256 hashing, verification endpoints for versions and exports | 8 | URS-SYS-009 | OQ-COMP-005 |
| RA-SYS-008 | Recovery failure | Backup/restore controls missing | Prolonged outage, data loss | 5 | 2 | 2 | 20 | Encrypted backup scripts, restore integrity verification | 8 | URS-SYS-011 | IQ-INFRA-004, OQ-OPS-001 |
| RA-SYS-009 | Vulnerable code release | No automated security gate | Increased exploit risk | 4 | 3 | 2 | 24 | CI security gates: tests, lint/typecheck, SAST, secrets/dependency scans | 9 | URS-SYS-012 | OQ-SEC-006 |

## 4. Residual Risk Evaluation
Residual risks are considered acceptable when control verification tests pass and no critical quality-gate failures remain open.

## 5. Reassessment Triggers
- Major release impacting auth, audit, signature, or export modules.
- Change in regulatory requirements.
- Major incident or failed integrity/restore verification.
