# Security Control Applicability And Enforcement (ValDoc.AI)

## Purpose
This document maps Priority 1 security controls to implemented code paths and operational procedures.

## 1) Upload Pipeline Proof
### Enforced controls
- File extension allowlist by upload kind:
  - `src/server/files/storage.ts`
  - Allowed: `.pdf`, `.doc`, `.docx`, `.txt`
- Magic-byte and structural verification (do not trust extension/content-type):
  - `src/server/files/storage.ts`
  - PDF signature checks, DOC (OLE) checks, DOCX ZIP/content checks, text validation
- Size limits by document category:
  - `src/server/files/storage.ts`
- PDF page-count limits and DOCX anti-zip-bomb controls:
  - `src/server/files/storage.ts`
- Malware scan before persistence:
  - `src/server/files/storage.ts`
  - `src/server/files/malwareScan.ts`
- Quarantine on scan failure with metadata and random IDs:
  - `storage/quarantine/`
  - `src/server/files/storage.ts`

### Verification evidence
- Automated tests:
  - `src/server/files/storage.test.ts`
  - `src/server/files/malwareScan.test.ts`
  - `src/app/api/uploads/route.test.ts`
- Evidence pack locations:
  - `02-Automated-Security-Scans/`
  - `03-Automated-Tests/`
  - `07-Deployment-Hardening/`

## 2) Production Malware Scanning Policy
### Enforced policy
- Production startup fails if malware scanner is `stub`.
- Production requires `MALWARE_SCANNER_PROVIDER=clamav` or `managed`.
- If `managed`, endpoint/token must be configured and secure.
- Enforcement:
  - `src/server/config/env.ts`
  - `src/server/config/env.test.ts`

### Operational response procedure (detection)
1. Upload is blocked and not stored in active uploads path.
2. File is moved to quarantine storage with generated quarantine ID.
3. Quarantine metadata JSON is written with reason/timestamp.
4. User receives rejection message containing quarantine ID.
5. QA/Security reviews quarantine artifact and metadata.
6. If malicious:
   - retain evidence,
   - create incident ticket/CAPA,
   - block source/user as needed,
   - preserve related audit events.
7. If false positive:
   - document disposition,
   - adjust scanner policy/signatures per change control.

## 3) PDF/DOCX Parsing Fidelity For Defensible Citations
### Implementation
- Page-aware PDF parsing implemented using `pdf-parse` pagerender callback.
- Citation chunks include explicit page numbers and section indices.
- Prompt-injection text is sanitized before extraction usage.
- Code:
  - `src/server/parsers/pdfParser.ts`
  - `src/server/parsers/pdfParser.test.ts`
  - `src/server/security/promptGuardrails.ts`

### Notes
- Citations are persisted with page and section metadata in source chunks.
- Search/indexing remains organization-scoped.

## 4) Audit-Chain Operationalization
### Implemented controls
- Verify-chain endpoints:
  - `GET /api/admin/audit/verify-chain`
  - `POST /api/admin/audit/verify-chain`
- Verification reports are persisted:
  - `AuditVerificationReport` records + report JSON files
  - `src/server/audit/verificationReport.ts`

### Scheduled/triggered control
- Command:
  - `npm run audit:verify-chain:scheduled -- --lookback-days=1`
- Script:
  - `scripts/run_audit_chain_verification.ts`
- Behavior:
  - resolves active org + admin actor
  - runs bounded audit-chain verification
  - stores report in DB and filesystem
  - writes operational summary log to `storage/logs/`

### Recommended cadence
- Daily scheduled execution in production (external scheduler/cron).
- Weekly management review of generated verification reports.

## 5) Related Priority 1 Hardening
- Distributed rate-limiting requirement in production:
  - `src/server/security/rateLimit.ts`
  - `src/server/config/env.ts`
- Startup hard-block for insecure OpenSearch and default MinIO credentials:
  - `src/server/config/env.ts`
  - `scripts/check-compose-security.ts`

