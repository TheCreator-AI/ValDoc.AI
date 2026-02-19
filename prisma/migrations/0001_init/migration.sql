-- Initial schema for ValDoc.AI MVP
CREATE TABLE "Organization" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DeploymentConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "orgName" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DeploymentConfig_customerId_key" ON "DeploymentConfig"("customerId");

CREATE TABLE "DeploymentRole" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DeploymentRole_name_key" ON "DeploymentRole"("name");

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Machine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "modelNumber" TEXT NOT NULL,
  "manufacturer" TEXT NOT NULL,
  "equipmentFactModel" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Machine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Unit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "unitGroupId" TEXT,
  "unitCode" TEXT NOT NULL,
  "serialNumber" TEXT,
  "location" TEXT,
  "procurementDate" DATETIME,
  "calibrationDate" DATETIME,
  "calibrationDueDate" DATETIME,
  "pmPlanNumber" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Unit_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Unit_machineId_unitCode_key" ON "Unit"("machineId", "unitCode");

CREATE TABLE "MachineVendorDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "documentType" TEXT NOT NULL DEFAULT 'VENDOR_REFERENCE',
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MachineVendorDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MachineVendorDocument_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UnitExecutedDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitExecutedDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UnitExecutedDocument_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SourceDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "machineId" TEXT,
  "uploadedByUserId" TEXT,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "extractedText" TEXT,
  "citationsJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SourceDocument_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "SourceChunk" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceDocumentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "sectionLabel" TEXT NOT NULL,
  "chunkText" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceChunk_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SourceChunk_organizationId_sectionLabel_idx" ON "SourceChunk"("organizationId", "sectionLabel");

CREATE TABLE "DocumentTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "effectiveDate" DATETIME,
  "createdByUserId" TEXT,
  "approvedByUserId" TEXT,
  "approvedAt" DATETIME,
  "docType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contentTemplate" TEXT NOT NULL,
  "templateKind" TEXT NOT NULL DEFAULT 'EXAMPLE',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sourceFileName" TEXT,
  "sourceFilePath" TEXT,
  "sourceMimeType" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DocumentTemplate_organizationId_templateId_version_key" ON "DocumentTemplate"("organizationId", "templateId", "version");
CREATE INDEX "DocumentTemplate_organizationId_docType_status_approvedAt_idx" ON "DocumentTemplate"("organizationId", "docType", "status", "approvedAt");

CREATE TABLE "GenerationJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenerationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GenerationJob_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "GeneratedDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "generationJobId" TEXT NOT NULL,
  "templateId" TEXT,
  "templateVersion" INTEGER,
  "templateRecordId" TEXT,
  "docType" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'PRE_EXECUTION',
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currentContent" TEXT NOT NULL,
  "citationsJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeneratedDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GeneratedDocument_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DocumentVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "generatedDocumentId" TEXT NOT NULL,
  "editedByUserId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'DRAFT',
  "contentSnapshot" TEXT NOT NULL,
  "contentHash" TEXT,
  "signatureManifest" TEXT,
  "supersedesVersionId" TEXT,
  "changeComment" TEXT,
  "changeReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentVersion_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentVersion_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DocumentVersion_generatedDocumentId_versionNumber_idx" ON "DocumentVersion"("generatedDocumentId", "versionNumber");
CREATE INDEX "DocumentVersion_generatedDocumentId_state_idx" ON "DocumentVersion"("generatedDocumentId", "state");

CREATE TABLE "TraceabilityLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "generatedDocumentId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "riskControlId" TEXT NOT NULL,
  "testCaseId" TEXT NOT NULL,
  "citationSourceId" TEXT,
  "citationPage" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TraceabilityLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TraceabilityLink_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EquipmentFact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "factType" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "units" TEXT,
  "sourceRef" TEXT,
  "confidence" REAL,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentFact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EquipmentFact_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EquipmentFact_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EquipmentFact_organizationId_machineId_factType_idx" ON "EquipmentFact"("organizationId", "machineId", "factType");

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
  "metadataJson" TEXT,
  "detailsJson" TEXT,
  "prevHash" TEXT,
  "eventHash" TEXT,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuditEvent_organizationId_entityType_entityId_idx" ON "AuditEvent"("organizationId", "entityType", "entityId");
CREATE INDEX "AuditEvent_organizationId_timestamp_idx" ON "AuditEvent"("organizationId", "timestamp");

CREATE TABLE "AuditChainHead" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "headHash" TEXT,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AuditChainHead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AuditChainHead_organizationId_key" ON "AuditChainHead"("organizationId");

CREATE TABLE "AuditEventDetail" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "changePath" TEXT NOT NULL,
  "oldValue" TEXT,
  "newValue" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuditEventDetail_eventId_idx" ON "AuditEventDetail"("eventId");

CREATE TABLE "LabGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LabGroup_organizationId_name_key" ON "LabGroup"("organizationId", "name");

CREATE TABLE "ChangeControl" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "machineId" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "qaApprovedByUserId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "changeType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "riskAssessment" TEXT,
  "systemImpactSummary" TEXT,
  "requiresRevalidation" BOOLEAN NOT NULL DEFAULT false,
  "revalidationPlan" TEXT,
  "trainingPlan" TEXT,
  "implementationNotes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" DATETIME,
  CONSTRAINT "ChangeControl_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChangeControl_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ChangeControlLabImpact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "changeControlId" TEXT NOT NULL,
  "labGroupId" TEXT NOT NULL,
  "impactLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
  "impactSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChangeControlLabImpact_changeControlId_fkey" FOREIGN KEY ("changeControlId") REFERENCES "ChangeControl"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChangeControlLabImpact_labGroupId_fkey" FOREIGN KEY ("labGroupId") REFERENCES "LabGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChangeControlLabImpact_changeControlId_labGroupId_key" ON "ChangeControlLabImpact"("changeControlId", "labGroupId");

CREATE TABLE "UnitGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UnitGroup_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UnitGroup_machineId_name_key" ON "UnitGroup"("machineId", "name");

CREATE TABLE "DocumentExport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "exportId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "docId" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentExport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentExport_docId_fkey" FOREIGN KEY ("docId") REFERENCES "GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentExport_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DocumentExport_exportId_key" ON "DocumentExport"("exportId");
CREATE INDEX "DocumentExport_organizationId_docId_createdAt_idx" ON "DocumentExport"("organizationId", "docId", "createdAt");

CREATE TABLE "ElectronicSignature" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "recordVersionId" TEXT NOT NULL,
  "signerUserId" TEXT NOT NULL,
  "signerFullName" TEXT NOT NULL,
  "meaning" TEXT NOT NULL,
  "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authMethod" TEXT NOT NULL DEFAULT 'PASSWORD_REAUTH',
  "signatureManifest" TEXT NOT NULL,
  "remarks" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ElectronicSignature_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ElectronicSignature_signerUserId_fkey" FOREIGN KEY ("signerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ElectronicSignature_organizationId_recordType_recordId_recordVersionId_idx" ON "ElectronicSignature"("organizationId", "recordType", "recordId", "recordVersionId");
CREATE INDEX "ElectronicSignature_organizationId_signedAt_idx" ON "ElectronicSignature"("organizationId", "signedAt");
