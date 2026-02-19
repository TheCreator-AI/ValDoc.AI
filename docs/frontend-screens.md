# Frontend Screen Outlines

## 1) Login Screen
- Email and password fields.
- Session creation through `/api/auth/login`.
- Enterprise tenant isolation messaging.

## 2) Equipment Scope Screen
- Create machine: name, model number, manufacturer.
- Select machine for upload and generation operations.

## 3) Upload Screen (Drag-and-Drop)
- Source type selector (manual, datasheet, drawing, SOP, client criteria, site standard, template).
- Drag-and-drop zone plus fallback file input.
- Upload processing feedback.

## 4) Generation Screen
- Start pre-execution generation (URS, SIA, DIA, RID, IOQ).
- Start post-execution generation (protocol/final summaries).
- Show latest generation jobs and statuses.

## 5) Review Screen
- Per-document editor.
- Version save action.
- Reviewer decisions: approve/reject.
- Status display for audit workflow.

## 6) Export Screen
- DOCX and PDF export per document.
- ZIP package export for full validation package.

## 7) Change Control Screen
- Create lab/equipment groups.
- Submit change controls with risk/system impact and revalidation plan.
- Mark impacted groups to differentiate affected labs.
- QA approval action and status tracking.
