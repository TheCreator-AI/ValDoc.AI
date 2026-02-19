# ValDoc.AI Software System URS

Document ID: `VALDOC-SYS-URS`  
Version: `1.0`  
Status: `Draft`  

## 1. Purpose
Define user requirements for the ValDoc.AI software platform used to create, review, and export validation records in regulated environments.

## 2. Scope
This URS applies to the web application, API services, persistence layer, and validation-focused workflows implemented in this repository.

## 3. Intended Use
The system shall enable authorized users to manage validation content, execute controlled workflows, and produce compliance-oriented evidence artifacts for equipment validation and software validation records.

## 4. Functional Requirements

| Req ID | Category | Requirement Statement | Rationale | Acceptance Criteria | Test Method | Criticality |
|---|---|---|---|---|---|---|
| URS-SYS-001 | Access Control | The system shall enforce role-based access controls on server-side APIs for Admin, Author/User, Reviewer, Approver, and Viewer roles. | Prevent unauthorized actions. | Restricted endpoints return access denied for unauthorized roles. | OQ | High |
| URS-SYS-002 | Authentication | The system shall enforce authentication with session control, lockout, and password policy controls. | Protect system access. | Login and session behaviors match policy settings. | OQ | High |
| URS-SYS-003 | Audit Trail | The system shall record append-only audit events for security- and compliance-relevant actions. | Ensure traceability and accountability. | Audit records are created for required actions and cannot be edited through normal flows. | OQ | High |
| URS-SYS-004 | E-Signatures | The system shall support electronic signatures with meaning, re-authentication, and record hash linkage. | 21 CFR Part 11-style control alignment. | Sign action requires password re-entry and stores signature manifest hash. | OQ | High |
| URS-SYS-005 | Version Control | The system shall maintain document version lifecycle states (Draft, In Review, Approved, Obsolete) and enforce transition rules. | Controlled record progression. | Invalid transitions are blocked; valid transitions are logged. | OQ | High |
| URS-SYS-006 | Immutability | The system shall prevent editing approved document versions and require new version creation for changes. | Maintain integrity of approved records. | Attempts to edit approved versions are rejected. | OQ | High |
| URS-SYS-007 | Correction Handling | The system shall capture correction reason, actor, timestamp, and field-level changes in audit details. | Transparent correction process. | Correction version creation records reason and field-level diff. | OQ | High |
| URS-SYS-008 | Controlled Delete | The system shall disallow hard delete for regulated records and use soft delete with reason and audit log. | Preserve historical records. | Soft delete endpoint marks record deleted and logs reason; hard delete path unavailable. | OQ | High |
| URS-SYS-009 | Integrity Verification | The system shall compute and store SHA-256 hashes for document versions and exported artifacts and provide verification APIs. | Tamper detection. | Verification endpoints return match/mismatch correctly. | OQ | High |
| URS-SYS-010 | Export Security | The system shall enforce authorization and secure response headers for document downloads. | Prevent unauthorized data disclosure. | Unauthorized access denied; responses include attachment disposition and nosniff. | OQ | High |
| URS-SYS-011 | Backup and Restore | The system shall provide backup, restore, and integrity verification scripts for operational recovery. | Business continuity. | Backup/restore workflow executes and verifies chain/hash integrity. | IQ/OQ | High |
| URS-SYS-012 | Security Gates | The system shall support automated security gates (tests, lint/typecheck, dependency, SAST, secrets scanning). | Continuous control verification. | CI and local commands execute with fail conditions for violations. | OQ | Medium |

## 5. Non-Functional Requirements
- Availability: application health endpoint shall report readiness.
- Performance: verification endpoints should complete in operationally acceptable time for normal payload sizes.
- Security: secrets shall not be stored in source code.

## 6. Data Integrity Requirements
- All regulated timestamps shall be server-generated.
- Audit chain shall be tamper-evident by hash chaining.
- Signature records shall include signer, meaning, timestamp, and record hash.

## 7. References
- Internal repository controls and tests.
- Project README and API documentation.
