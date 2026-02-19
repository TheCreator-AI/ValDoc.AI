# Application Functionality and Database Mapping Summary

## Overview
ValDoc.AI is a web-based, multi-tenant validation document automation platform for biotechnology operations. It ingests regulated source material (manuals, criteria, SOPs, standards), extracts a structured equipment fact model with citations, and generates draft validation deliverables aligned to template-driven formats.

Key generated outputs:
- Pre-execution: URS, SIA, DIA, RID, IOQ
- Post-execution: protocol summary and final summary report
- Traceability links (requirements, risk controls, test cases)

The current implementation is an MVP with production-oriented structure:
- Tenant isolation by organization scope on every data query.
- RBAC for admin, engineer, reviewer.
- Audit-ready version history for generated documents.
- Export pipeline for DOCX, PDF, ZIP.

## End-to-end Workflow
1. A user signs in with email/password and receives a signed session cookie.
2. The user creates/selects a machine under their organization.
3. The user uploads source files and templates.
4. The backend parses text, creates citation chunks, and indexes searchable chunks.
5. The extraction service builds the machine-level fact model JSON.
6. The generation service creates staged document drafts from templates and fact/citation context.
7. Change controls capture modifications, lab-group impact scope, QA approval, and revalidation actions.
8. Reviewers edit content, save versions, and approve/reject documents.
9. Final outputs are exported as DOCX/PDF or as a ZIP validation package.

## Security and Multi-tenant Isolation
Security model emphasizes enterprise separation:
- Session token includes `userId`, `organizationId`, and `role`.
- API handlers enforce authentication and role checks.
- Queries are always constrained by `organizationId` to prevent cross-company data leakage.
- Example tenant behavior:
  - `andrew@qa.org` can only access `org_qa` records.
  - `emily@qp.org` can only access `org_qp` records.

RBAC intent:
- `ADMIN`: full org control.
- `ENGINEER`: upload, generate, and draft editing.
- `REVIEWER`: review decisions and compliance gating.

## Core Capabilities
### Upload and Knowledge Base
- Ingests files through multipart upload.
- Stores file metadata, source type, and extracted text.
- Splits content into citation-aware chunks (`page`, `section`, `text`).
- Stores chunks for search and citation retrieval.

### Fact Model Extraction
Generates JSON structure per machine, including:
- intended use
- core functions
- utilities
- safety features
- sensors
- data interfaces
- software versions
- process ranges
- citations

### Document Generation
For each target document type, the generator:
- loads the organization�s template
- maps fact model values into template placeholders
- appends citation strings
- persists generated draft and first audit version
- creates baseline traceability rows

### Review and Audit
- Save any edited draft as a new version with comments.
- Track version number, editor identity, and timestamp.
- Set document state to approved/rejected for workflow control.

### Export
- DOCX export for controlled document editing.
- PDF export for fixed-format review sharing.
- ZIP package containing all generated docs and traceability CSVs.

## Database Mapping
The schema is normalized around organizations, machines, source evidence, generation jobs, and document lifecycle.

### Tenant and User Layer
- `Organization`
  - Root tenant boundary.
  - One-to-many with users, machines, templates, source docs, jobs, generated docs.
- `User`
  - Belongs to one organization.
  - Has role and credential hash.
  - Referenced by `DocumentVersion.editedByUserId`.

### Equipment and Source Knowledge
- `Machine`
  - Belongs to one organization.
  - Stores canonical `equipmentFactModel` JSON.
  - Parent for related source docs and generation jobs.
- `SourceDocument`
  - Belongs to organization; optionally linked to machine.
  - Tracks file metadata + extracted text + raw citation payload.
- `SourceChunk`
  - Child chunks per source document.
  - Stores page/section/text for search + evidence citations.

### Templates and Generation
- `DocumentTemplate`
  - Scoped by organization and document type.
  - Unique constraint on `(organizationId, docType)`.
- `GenerationJob`
  - Represents one generation run for a machine.
  - Tracks status lifecycle and timestamps.
- `GeneratedDocument`
  - Output per document type linked to a generation job.
  - Stores current draft content and citation JSON.

### Review and Traceability
- `DocumentVersion`
  - Immutable snapshots per save event.
  - Links generated document to editor user.
- `TraceabilityLink`
  - Maps requirement to risk control and test case.
  - Holds optional citation source/page linkage.

## Relationship Highlights
- One organization has many machines, users, and jobs.
- One machine has many source docs and generation jobs.
- One generation job has many generated documents.
- One generated document has many versions and trace links.
- One source document has many source chunks.

## Search and Citation Tracking
Current indexing approach stores parsed chunks in SQL for immediate searchable retrieval and citation traceability. Optional OpenSearch service is included in deployment scaffolding for scaling indexing workloads.

## Compliance-Oriented Behaviors
- Citation references are embedded in generated narratives.
- Draft/version lifecycle supports audit reconstruction.
- Traceability links establish requirement-to-test lineage.
- Tenant-level segregation supports vendor-hosted enterprise deployments.

## Practical Limits of Current MVP
- PDF parsing uses a baseline parser (single-page chunking assumptions where source lacks page map).
- LLM-driven extraction/generation is represented by strong prompt scaffolds plus deterministic stubs.
- This foundation is production-structured but expects extension for full validation-grade controls (electronic signatures, formal workflow states, ALCOA+ evidence controls, and immutable audit event ledger).
