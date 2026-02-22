-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'USER', 'APPROVER', 'AUTHOR', 'REVIEWER', 'VIEWER', 'ENGINEER');

-- CreateEnum
CREATE TYPE "public"."SourceType" AS ENUM ('MANUAL', 'DATASHEET', 'DRAWING', 'SOP', 'CLIENT_CRITERIA', 'SITE_STANDARD', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "public"."DocType" AS ENUM ('URS', 'SIA', 'RID', 'DIA', 'IOQ', 'OQ', 'EXECUTED_PROTOCOL', 'PROTOCOL_SUMMARY', 'SUMMARY', 'TRACEABILITY');

-- CreateEnum
CREATE TYPE "public"."DocumentStage" AS ENUM ('PRE_EXECUTION', 'EXECUTION', 'POST_EXECUTION');

-- CreateEnum
CREATE TYPE "public"."ExecutedDocumentType" AS ENUM ('VENDOR_DOCUMENT', 'VENDOR_IOQ', 'OWNER_IOQ', 'EXECUTED_PROTOCOL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."TemplateStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."ReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."DocumentVersionState" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "public"."AuditOutcome" AS ENUM ('SUCCESS', 'DENIED');

-- CreateEnum
CREATE TYPE "public"."SignatureMeaning" AS ENUM ('AUTHOR', 'REVIEW', 'APPROVE');

-- CreateEnum
CREATE TYPE "public"."UserAccountStatus" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeploymentConfig" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeploymentRole" (
    "id" TEXT NOT NULL,
    "name" "public"."Role" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "userStatus" "public"."UserAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "passwordUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Machine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelNumber" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "equipmentFactModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EquipmentFact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "factType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "units" TEXT,
    "sourceRef" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "outcome" "public"."AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "metadataJson" TEXT,
    "detailsJson" TEXT,
    "prevHash" TEXT,
    "eventHash" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditChainHead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "headHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditChainHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEventDetail" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "changePath" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEventDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Unit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "unitGroupId" TEXT,
    "unitCode" TEXT NOT NULL,
    "serialNumber" TEXT,
    "location" TEXT,
    "procurementDate" TIMESTAMP(3),
    "calibrationDate" TIMESTAMP(3),
    "calibrationDueDate" TIMESTAMP(3),
    "pmPlanNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UnitGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MachineVendorDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'VENDOR_REFERENCE',
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineVendorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UnitExecutedDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" "public"."ExecutedDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitExecutedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LabGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SourceDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "machineId" TEXT,
    "uploadedByUserId" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceType" "public"."SourceType" NOT NULL,
    "extractedText" TEXT,
    "citationsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SourceChunk" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "sectionLabel" TEXT NOT NULL,
    "chunkText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "public"."TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveDate" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "docType" "public"."DocType" NOT NULL,
    "title" TEXT NOT NULL,
    "contentTemplate" TEXT NOT NULL,
    "templateKind" TEXT NOT NULL DEFAULT 'EXAMPLE',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sourceFileName" TEXT,
    "sourceFilePath" TEXT,
    "sourceMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GenerationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GeneratedDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "generationJobId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "templateRecordId" TEXT,
    "docType" "public"."DocType" NOT NULL,
    "stage" "public"."DocumentStage" NOT NULL DEFAULT 'PRE_EXECUTION',
    "title" TEXT NOT NULL,
    "status" "public"."ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "currentContent" TEXT NOT NULL,
    "citationsJson" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChangeControl" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ChangeControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChangeControlLabImpact" (
    "id" TEXT NOT NULL,
    "changeControlId" TEXT NOT NULL,
    "labGroupId" TEXT NOT NULL,
    "impactLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
    "impactSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeControlLabImpact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentVersion" (
    "id" TEXT NOT NULL,
    "generatedDocumentId" TEXT NOT NULL,
    "editedByUserId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "state" "public"."DocumentVersionState" NOT NULL DEFAULT 'DRAFT',
    "contentSnapshot" TEXT NOT NULL,
    "contentHash" TEXT,
    "signatureManifest" TEXT,
    "supersedesVersionId" TEXT,
    "changeComment" TEXT,
    "changeReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetentionPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditEventRetentionDays" INTEGER,
    "documentVersionRetentionDays" INTEGER,
    "legalHoldEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LegalHold" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "recordVersionId" TEXT,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "releasedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetentionPurgeRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "reportJson" TEXT NOT NULL,
    "reportHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "reportPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionPurgeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ElectronicSignature" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "recordVersionId" TEXT NOT NULL,
    "signerUserId" TEXT NOT NULL,
    "signerFullName" TEXT NOT NULL,
    "meaning" "public"."SignatureMeaning" NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authMethod" TEXT NOT NULL DEFAULT 'PASSWORD_REAUTH',
    "signatureManifest" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectronicSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppRelease" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildVersion" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "riskImpact" TEXT NOT NULL,
    "buildHash" TEXT NOT NULL DEFAULT '',
    "sbomHash" TEXT NOT NULL DEFAULT '',
    "testResultsSummaryHash" TEXT NOT NULL DEFAULT '',
    "productionDeployRequested" BOOLEAN NOT NULL DEFAULT false,
    "approvedSignatureId" TEXT,
    "approvedByUserId" TEXT,
    "deployedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TraceabilityLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "generatedDocumentId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "riskControlId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "citationSourceId" TEXT,
    "citationPage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceabilityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentExport" (
    "id" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AccessReviewReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "reportJson" TEXT NOT NULL,
    "reportHash" TEXT NOT NULL,
    "reportPath" TEXT NOT NULL,
    "reportFormat" TEXT NOT NULL DEFAULT 'csv',
    "attestedSignatureId" TEXT,
    "attestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessReviewReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditVerificationReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rangeStart" TIMESTAMP(3),
    "rangeEnd" TIMESTAMP(3),
    "checkedEvents" INTEGER NOT NULL,
    "chainHeadStored" TEXT,
    "chainHeadComputed" TEXT,
    "pass" BOOLEAN NOT NULL,
    "firstBrokenEventId" TEXT,
    "failureReason" TEXT,
    "reportJson" TEXT NOT NULL,
    "reportHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "reportPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditVerificationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "idleTimeoutSeconds" INTEGER NOT NULL DEFAULT 1800,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentConfig_customerId_key" ON "public"."DeploymentConfig"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentRole_name_key" ON "public"."DeploymentRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "EquipmentFact_organizationId_machineId_factType_idx" ON "public"."EquipmentFact"("organizationId", "machineId", "factType");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_entityType_entityId_idx" ON "public"."AuditEvent"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_timestamp_idx" ON "public"."AuditEvent"("organizationId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "AuditChainHead_organizationId_key" ON "public"."AuditChainHead"("organizationId");

-- CreateIndex
CREATE INDEX "AuditEventDetail_eventId_idx" ON "public"."AuditEventDetail"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_machineId_unitCode_key" ON "public"."Unit"("machineId", "unitCode");

-- CreateIndex
CREATE UNIQUE INDEX "UnitGroup_machineId_name_key" ON "public"."UnitGroup"("machineId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LabGroup_organizationId_name_key" ON "public"."LabGroup"("organizationId", "name");

-- CreateIndex
CREATE INDEX "SourceChunk_organizationId_sectionLabel_idx" ON "public"."SourceChunk"("organizationId", "sectionLabel");

-- CreateIndex
CREATE INDEX "DocumentTemplate_organizationId_docType_status_approvedAt_idx" ON "public"."DocumentTemplate"("organizationId", "docType", "status", "approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_organizationId_templateId_version_key" ON "public"."DocumentTemplate"("organizationId", "templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeControlLabImpact_changeControlId_labGroupId_key" ON "public"."ChangeControlLabImpact"("changeControlId", "labGroupId");

-- CreateIndex
CREATE INDEX "DocumentVersion_generatedDocumentId_versionNumber_idx" ON "public"."DocumentVersion"("generatedDocumentId", "versionNumber");

-- CreateIndex
CREATE INDEX "DocumentVersion_generatedDocumentId_state_idx" ON "public"."DocumentVersion"("generatedDocumentId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_organizationId_key" ON "public"."RetentionPolicy"("organizationId");

-- CreateIndex
CREATE INDEX "LegalHold_organizationId_recordType_recordId_isActive_idx" ON "public"."LegalHold"("organizationId", "recordType", "recordId", "isActive");

-- CreateIndex
CREATE INDEX "RetentionPurgeRun_organizationId_createdAt_idx" ON "public"."RetentionPurgeRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ElectronicSignature_organizationId_recordType_recordId_reco_idx" ON "public"."ElectronicSignature"("organizationId", "recordType", "recordId", "recordVersionId");

-- CreateIndex
CREATE INDEX "ElectronicSignature_organizationId_signedAt_idx" ON "public"."ElectronicSignature"("organizationId", "signedAt");

-- CreateIndex
CREATE INDEX "AppRelease_organizationId_releaseDate_idx" ON "public"."AppRelease"("organizationId", "releaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "AppRelease_organizationId_buildVersion_key" ON "public"."AppRelease"("organizationId", "buildVersion");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentExport_exportId_key" ON "public"."DocumentExport"("exportId");

-- CreateIndex
CREATE INDEX "DocumentExport_organizationId_docId_createdAt_idx" ON "public"."DocumentExport"("organizationId", "docId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessReviewReport_organizationId_createdAt_idx" ON "public"."AccessReviewReport"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditVerificationReport_organizationId_createdAt_idx" ON "public"."AuditVerificationReport"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "UserSession_organizationId_userId_createdAt_idx" ON "public"."UserSession"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserSession_organizationId_revokedAt_expiresAt_idx" ON "public"."UserSession"("organizationId", "revokedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Machine" ADD CONSTRAINT "Machine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EquipmentFact" ADD CONSTRAINT "EquipmentFact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EquipmentFact" ADD CONSTRAINT "EquipmentFact_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "public"."Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EquipmentFact" ADD CONSTRAINT "EquipmentFact_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditChainHead" ADD CONSTRAINT "AuditChainHead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEventDetail" ADD CONSTRAINT "AuditEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."AuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Unit" ADD CONSTRAINT "Unit_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "public"."Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Unit" ADD CONSTRAINT "Unit_unitGroupId_fkey" FOREIGN KEY ("unitGroupId") REFERENCES "public"."UnitGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UnitGroup" ADD CONSTRAINT "UnitGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UnitGroup" ADD CONSTRAINT "UnitGroup_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "public"."Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MachineVendorDocument" ADD CONSTRAINT "MachineVendorDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MachineVendorDocument" ADD CONSTRAINT "MachineVendorDocument_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "public"."Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UnitExecutedDocument" ADD CONSTRAINT "UnitExecutedDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UnitExecutedDocument" ADD CONSTRAINT "UnitExecutedDocument_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LabGroup" ADD CONSTRAINT "LabGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SourceDocument" ADD CONSTRAINT "SourceDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SourceDocument" ADD CONSTRAINT "SourceDocument_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "public"."Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SourceChunk" ADD CONSTRAINT "SourceChunk_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "public"."SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GenerationJob" ADD CONSTRAINT "GenerationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GenerationJob" ADD CONSTRAINT "GenerationJob_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "public"."Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "public"."GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChangeControl" ADD CONSTRAINT "ChangeControl_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChangeControl" ADD CONSTRAINT "ChangeControl_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "public"."Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChangeControlLabImpact" ADD CONSTRAINT "ChangeControlLabImpact_changeControlId_fkey" FOREIGN KEY ("changeControlId") REFERENCES "public"."ChangeControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChangeControlLabImpact" ADD CONSTRAINT "ChangeControlLabImpact_labGroupId_fkey" FOREIGN KEY ("labGroupId") REFERENCES "public"."LabGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVersion" ADD CONSTRAINT "DocumentVersion_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "public"."GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVersion" ADD CONSTRAINT "DocumentVersion_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LegalHold" ADD CONSTRAINT "LegalHold_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LegalHold" ADD CONSTRAINT "LegalHold_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LegalHold" ADD CONSTRAINT "LegalHold_releasedByUserId_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetentionPurgeRun" ADD CONSTRAINT "RetentionPurgeRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetentionPurgeRun" ADD CONSTRAINT "RetentionPurgeRun_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ElectronicSignature" ADD CONSTRAINT "ElectronicSignature_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ElectronicSignature" ADD CONSTRAINT "ElectronicSignature_signerUserId_fkey" FOREIGN KEY ("signerUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppRelease" ADD CONSTRAINT "AppRelease_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppRelease" ADD CONSTRAINT "AppRelease_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppRelease" ADD CONSTRAINT "AppRelease_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppRelease" ADD CONSTRAINT "AppRelease_approvedSignatureId_fkey" FOREIGN KEY ("approvedSignatureId") REFERENCES "public"."ElectronicSignature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TraceabilityLink" ADD CONSTRAINT "TraceabilityLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TraceabilityLink" ADD CONSTRAINT "TraceabilityLink_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "public"."GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentExport" ADD CONSTRAINT "DocumentExport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentExport" ADD CONSTRAINT "DocumentExport_docId_fkey" FOREIGN KEY ("docId") REFERENCES "public"."GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentExport" ADD CONSTRAINT "DocumentExport_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccessReviewReport" ADD CONSTRAINT "AccessReviewReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccessReviewReport" ADD CONSTRAINT "AccessReviewReport_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditVerificationReport" ADD CONSTRAINT "AuditVerificationReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditVerificationReport" ADD CONSTRAINT "AuditVerificationReport_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSession" ADD CONSTRAINT "UserSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

