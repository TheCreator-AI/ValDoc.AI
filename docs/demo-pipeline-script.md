# Demo Script: End-to-End Generation Pipeline

## Preconditions
- App is running (`npm run dev`)
- You are signed in as `ADMIN` or `ENGINEER`
- At least one machine exists with equipment facts populated

## 1. Trigger Pipeline
Call:

```bash
curl -X POST "http://localhost:3000/api/equipment/<machineId>/generate/pipeline" ^
  -H "Content-Type: application/json" ^
  -H "Cookie: session=<your-session-cookie>" ^
  -d "{\"intendedUse\":\"Maintain product at controlled temperature\",\"selectedDocTypes\":[\"URS\",\"RID\",\"IOQ\",\"OQ\",\"TRACEABILITY\"]}"
```

Expected:
- HTTP `201`
- Response includes:
  - `readyForExport`
  - `qualityIssues` (empty when passing)
  - `documents[]` with `docType`, `documentId`, `version`, `hash`

## 2. Verify Generated Documents
- Open the app and navigate to generated documents for the selected equipment.
- Confirm URS, RID, IOQ, OQ, and TRACEABILITY documents were created.
- Confirm each document has version/hash metadata in its persisted version record.

## 3. Verify Quality Gate Behavior
- If `readyForExport` is `false`, review returned `qualityIssues` and fix data gaps.
- Retry pipeline until `readyForExport` becomes `true`.

## 4. Verify Export Gating
- Attempt DOCX export for the generation job:
  - Should return `422` while quality gate has issues.
  - Should succeed once quality issues are resolved.

## 5. Verify Audit Trail
- As admin, open audit logs.
- Confirm entries for:
  - per-document pipeline generation (`urs.pipeline.generate`, etc.)
  - final pipeline result (`pipeline.generate.completed` or `pipeline.generate.failed_quality_gate`)
  - export/download events after export
