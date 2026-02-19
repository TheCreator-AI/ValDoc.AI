# ValDoc.AI IQ Protocol (Installation Qualification)

Document ID: `VALDOC-SYS-IQ`  
Version: `1.0`  
Status: `Draft`  

## 1. Purpose
Verify that ValDoc.AI is installed and configured correctly for intended operation.

## 2. Prerequisites
- Deployment environment provisioned.
- Required environment variables defined.
- Database available and migrations ready.
- Test admin account provisioned.

## 3. IQ Checklist

| IQ Test ID | Objective | Procedure | Expected Result | Evidence |
|---|---|---|---|---|
| IQ-INFRA-001 | Verify environment config validation | Start app with complete env set; then with required variable removed. | App starts with valid config; fails fast with missing required env var. | Startup logs/screenshots |
| IQ-INFRA-002 | Verify database schema deployment | Run migration/push command on clean database. | Schema applies without errors. | Migration output |
| IQ-INFRA-003 | Verify bootstrap/provisioning | Run provisioning/bootstrapping flow for first org/admin. | Organization, roles, and admin user created successfully. | Provision logs |
| IQ-INFRA-004 | Verify backup/restore utility availability | Execute backup and restore commands in test environment. | Backup artifact produced; restore command completes. | Script logs/artifacts |
| IQ-INFRA-005 | Verify health endpoint | Call `/api/health` after startup. | Health endpoint returns healthy response. | API output |
| IQ-INFRA-006 | Verify secure file storage pathing | Upload test file and inspect stored path naming. | UUID-based naming under non-public storage path. | Storage listing |

## 4. Deviations
Record deviations with impact and corrective actions before approval.

## 5. Approval
- Prepared by
- Reviewed by
- Approved by
