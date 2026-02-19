# ValDoc.AI OQ Protocol (Operational Qualification)

Document ID: `VALDOC-SYS-OQ`  
Version: `1.0`  
Status: `Draft`  

## 1. Purpose
Verify operational behavior of ValDoc.AI functions and security/compliance controls in a representative environment.

## 2. Test Cases

| OQ Test ID | Objective | Prerequisites | Steps | Expected Results | Linked URS | Linked Risk |
|---|---|---|---|---|---|---|
| OQ-SEC-001 | Verify RBAC deny path for restricted endpoint | Users with Viewer and Admin roles exist | 1) Sign in as Viewer 2) Attempt template create 3) Sign in as Admin and retry | Viewer denied with 403 and audit entry; Admin allowed | URS-SYS-001 | RA-SYS-001 |
| OQ-SEC-002 | Verify unauthorized download is blocked | Unprivileged user and protected doc exist | Attempt download/verify/export endpoints without proper access/session | Access denied and denied event logged | URS-SYS-001, URS-SYS-010 | RA-SYS-001 |
| OQ-SEC-003 | Verify lockout threshold and warning behavior | Account with known password exists | Submit invalid password repeatedly through threshold | Warning shown at 3/2/1 attempts left; account locked at threshold; audit logged | URS-SYS-002 | RA-SYS-002 |
| OQ-SEC-004 | Verify session expiration behavior | Authenticated session exists | Let session idle past configured timeout and perform API request | Session invalidated and access denied | URS-SYS-002 | RA-SYS-002 |
| OQ-COMP-001 | Verify audit append-only behavior | Admin account exists | Execute create/update actions and inspect audit endpoints/tables | Events append; no normal update/delete flow for audit events | URS-SYS-003 | RA-SYS-003 |
| OQ-COMP-002 | Verify audit chain integrity check | Existing audit events present | Call `/api/admin/audit/verify-chain` | Chain reports pass in normal state | URS-SYS-003 | RA-SYS-003 |
| OQ-COMP-003 | Verify e-signature controls | Reviewable record version exists | Trigger signature with wrong password then correct password | Wrong password denied + audited; valid signature stored with manifest hash | URS-SYS-004 | RA-SYS-004 |
| OQ-FUNC-005 | Verify lifecycle transition enforcement | Draft version exists | Attempt Draft->Approved direct transition then valid Draft->In Review->Approved path | Direct transition blocked; valid flow accepted and audited | URS-SYS-005, URS-SYS-006 | RA-SYS-005 |
| OQ-COMP-004 | Verify controlled delete behavior | Regulated record exists | Execute soft delete with/without reason | Missing reason blocked; with reason record soft-deleted and auditable | URS-SYS-008 | RA-SYS-006 |
| OQ-COMP-005 | Verify integrity mismatch detection | Exported artifact exists | Verify hash; tamper file in test env; verify again | First result matches true; post-tamper matches false | URS-SYS-009 | RA-SYS-007 |
| OQ-OPS-001 | Verify restore integrity checks | Backup artifact exists | Restore into test DB and run integrity verification harness | Integrity checks pass for docs, hashes, and audit chain | URS-SYS-011 | RA-SYS-008 |
| OQ-SEC-006 | Verify security gates execution | CI/local tools installed | Run security and quality commands | Commands complete successfully or fail on findings as configured | URS-SYS-012 | RA-SYS-009 |

## 3. Execution Record
- Tester:
- Date:
- Result:
- Evidence references:

## 4. Deviations and Resolution
- Deviation ID
- Impact
- Corrective action
- Retest result
