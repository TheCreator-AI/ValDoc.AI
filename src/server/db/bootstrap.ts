import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/server/db/prisma";

const toIdempotentSql = (sql: string) => {
  return sql
    .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
    .replace(/CREATE UNIQUE INDEX /g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ");
};

export const ensureDatabaseInitialized = async () => {
  const prismaWithRaw = prisma as typeof prisma & {
    $queryRawUnsafe?: <T = unknown>(query: string) => Promise<T>;
    $executeRawUnsafe?: (query: string) => Promise<unknown>;
  };

  // Unit tests may stub prisma without raw SQL helpers.
  if (typeof prismaWithRaw.$executeRawUnsafe !== "function") {
    return;
  }

  const migrationPath = path.resolve(process.cwd(), "prisma", "migrations", "0001_init", "migration.sql");
  const migrationSql = toIdempotentSql(await fs.promises.readFile(migrationPath, "utf8"));

  const statements = migrationSql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  const isIgnorableBootstrapError = (error: unknown) => {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return (
      message.includes("duplicate column name") ||
      message.includes("already exists")
    );
  };

  for (const statement of statements) {
    try {
      await prismaWithRaw.$executeRawUnsafe(statement);
    } catch (error) {
      if (!isIgnorableBootstrapError(error)) {
        throw error;
      }
    }
  }

  const hasColumn = async (table: string, column: string) => {
    if (typeof prismaWithRaw.$queryRawUnsafe !== "function") {
      return true;
    }
    const rows = await prismaWithRaw.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
    return rows.some((row) => row.name === column);
  };

  const ensureColumn = async (table: string, column: string, statement: string) => {
    if (!(await hasColumn(table, column))) {
      await prismaWithRaw.$executeRawUnsafe(statement);
    }
  };

  await ensureColumn(
    "GeneratedDocument",
    "stage",
    "ALTER TABLE \"GeneratedDocument\" ADD COLUMN \"stage\" TEXT NOT NULL DEFAULT 'PRE_EXECUTION'"
  );
  await ensureColumn("Unit", "serialNumber", "ALTER TABLE \"Unit\" ADD COLUMN \"serialNumber\" TEXT");
  await ensureColumn("Unit", "location", "ALTER TABLE \"Unit\" ADD COLUMN \"location\" TEXT");
  await ensureColumn("Unit", "procurementDate", "ALTER TABLE \"Unit\" ADD COLUMN \"procurementDate\" DATETIME");
  await ensureColumn("Unit", "calibrationDate", "ALTER TABLE \"Unit\" ADD COLUMN \"calibrationDate\" DATETIME");
  await ensureColumn("Unit", "calibrationDueDate", "ALTER TABLE \"Unit\" ADD COLUMN \"calibrationDueDate\" DATETIME");
  await ensureColumn("Unit", "pmPlanNumber", "ALTER TABLE \"Unit\" ADD COLUMN \"pmPlanNumber\" TEXT");
  await ensureColumn("Unit", "unitGroupId", "ALTER TABLE \"Unit\" ADD COLUMN \"unitGroupId\" TEXT");
  await ensureColumn("DocumentTemplate", "templateKind", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"templateKind\" TEXT NOT NULL DEFAULT 'EXAMPLE'");
  await ensureColumn("DocumentTemplate", "isPrimary", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"isPrimary\" BOOLEAN NOT NULL DEFAULT false");
  await ensureColumn("DocumentTemplate", "templateId", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"templateId\" TEXT");
  await ensureColumn("DocumentTemplate", "version", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"version\" INTEGER NOT NULL DEFAULT 1");
  await ensureColumn("DocumentTemplate", "status", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"status\" TEXT NOT NULL DEFAULT 'DRAFT'");
  await ensureColumn("DocumentTemplate", "effectiveDate", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"effectiveDate\" DATETIME");
  await ensureColumn("DocumentTemplate", "createdByUserId", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"createdByUserId\" TEXT");
  await ensureColumn("DocumentTemplate", "approvedByUserId", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"approvedByUserId\" TEXT");
  await ensureColumn("DocumentTemplate", "approvedAt", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"approvedAt\" DATETIME");
  await ensureColumn("DocumentTemplate", "sourceFileName", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"sourceFileName\" TEXT");
  await ensureColumn("DocumentTemplate", "sourceFilePath", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"sourceFilePath\" TEXT");
  await ensureColumn("DocumentTemplate", "sourceMimeType", "ALTER TABLE \"DocumentTemplate\" ADD COLUMN \"sourceMimeType\" TEXT");
  await ensureColumn("GeneratedDocument", "templateId", "ALTER TABLE \"GeneratedDocument\" ADD COLUMN \"templateId\" TEXT");
  await ensureColumn("GeneratedDocument", "templateVersion", "ALTER TABLE \"GeneratedDocument\" ADD COLUMN \"templateVersion\" INTEGER");
  await ensureColumn("GeneratedDocument", "templateRecordId", "ALTER TABLE \"GeneratedDocument\" ADD COLUMN \"templateRecordId\" TEXT");
  await ensureColumn("DocumentVersion", "contentHash", "ALTER TABLE \"DocumentVersion\" ADD COLUMN \"contentHash\" TEXT");
  await ensureColumn("DocumentVersion", "signatureManifest", "ALTER TABLE \"DocumentVersion\" ADD COLUMN \"signatureManifest\" TEXT");
  await ensureColumn("DocumentVersion", "state", "ALTER TABLE \"DocumentVersion\" ADD COLUMN \"state\" TEXT NOT NULL DEFAULT 'DRAFT'");
  await ensureColumn("DocumentVersion", "supersedesVersionId", "ALTER TABLE \"DocumentVersion\" ADD COLUMN \"supersedesVersionId\" TEXT");
  await ensureColumn("DocumentVersion", "changeReason", "ALTER TABLE \"DocumentVersion\" ADD COLUMN \"changeReason\" TEXT");
  await ensureColumn("GeneratedDocument", "deletedAt", "ALTER TABLE \"GeneratedDocument\" ADD COLUMN \"deletedAt\" DATETIME");
  await ensureColumn("DocumentVersion", "deletedAt", "ALTER TABLE \"DocumentVersion\" ADD COLUMN \"deletedAt\" DATETIME");
  await ensureColumn("Organization", "isActive", "ALTER TABLE \"Organization\" ADD COLUMN \"isActive\" BOOLEAN NOT NULL DEFAULT true");
  await ensureColumn("User", "userStatus", "ALTER TABLE \"User\" ADD COLUMN \"userStatus\" TEXT NOT NULL DEFAULT 'ACTIVE'");
  await ensureColumn("User", "mfaEnabled", "ALTER TABLE \"User\" ADD COLUMN \"mfaEnabled\" BOOLEAN NOT NULL DEFAULT false");
  await ensureColumn("User", "lastLoginAt", "ALTER TABLE \"User\" ADD COLUMN \"lastLoginAt\" DATETIME");
  await ensureColumn("AuditEvent", "timestamp", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"timestamp\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("AuditEvent", "outcome", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"outcome\" TEXT NOT NULL DEFAULT 'SUCCESS'");
  await ensureColumn("AuditEvent", "metadataJson", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"metadataJson\" TEXT");
  await ensureColumn("AuditEvent", "ip", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"ip\" TEXT");
  await ensureColumn("AuditEvent", "userAgent", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"userAgent\" TEXT");
  await ensureColumn("AuditEvent", "prevHash", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"prevHash\" TEXT");
  await ensureColumn("AuditEvent", "eventHash", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"eventHash\" TEXT");
  await prismaWithRaw.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"AuditEvent_organizationId_timestamp_idx\" ON \"AuditEvent\"(\"organizationId\", \"timestamp\")");
  await prismaWithRaw.$executeRawUnsafe("DROP TRIGGER IF EXISTS \"AuditEvent_no_update\"");
  await prismaWithRaw.$executeRawUnsafe(`
    CREATE TRIGGER "AuditEvent_no_update"
    BEFORE UPDATE ON "AuditEvent"
    BEGIN
      SELECT RAISE(ABORT, 'audit_events is append-only');
    END
  `);
  await prismaWithRaw.$executeRawUnsafe("DROP TRIGGER IF EXISTS \"AuditEvent_no_delete\"");
  await prismaWithRaw.$executeRawUnsafe(`
    CREATE TRIGGER "AuditEvent_no_delete"
    BEFORE DELETE ON "AuditEvent"
    BEGIN
      SELECT RAISE(ABORT, 'audit_events is append-only');
    END
  `);
  await prismaWithRaw.$executeRawUnsafe("DROP TRIGGER IF EXISTS \"AuditEventDetail_no_update\"");
  await prismaWithRaw.$executeRawUnsafe(`
    CREATE TRIGGER "AuditEventDetail_no_update"
    BEFORE UPDATE ON "AuditEventDetail"
    BEGIN
      SELECT RAISE(ABORT, 'audit_event_details is append-only');
    END
  `);
  await prismaWithRaw.$executeRawUnsafe("DROP TRIGGER IF EXISTS \"AuditEventDetail_no_delete\"");
  await prismaWithRaw.$executeRawUnsafe(`
    CREATE TRIGGER "AuditEventDetail_no_delete"
    BEFORE DELETE ON "AuditEventDetail"
    BEGIN
      SELECT RAISE(ABORT, 'audit_event_details is append-only');
    END
  `);
  await prismaWithRaw.$executeRawUnsafe("DROP INDEX IF EXISTS \"DocumentTemplate_organizationId_docType_key\"");
  await prismaWithRaw.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS \"DocumentTemplate_organizationId_templateId_version_key\" ON \"DocumentTemplate\"(\"organizationId\", \"templateId\", \"version\")");
  await prismaWithRaw.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"DocumentTemplate_organizationId_docType_status_approvedAt_idx\" ON \"DocumentTemplate\"(\"organizationId\", \"docType\", \"status\", \"approvedAt\")");
  await prismaWithRaw.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS \"AuditChainHead_organizationId_key\" ON \"AuditChainHead\"(\"organizationId\")");
  await prismaWithRaw.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"DocumentVersion_generatedDocumentId_versionNumber_idx\" ON \"DocumentVersion\"(\"generatedDocumentId\", \"versionNumber\")");
  await prismaWithRaw.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"DocumentVersion_generatedDocumentId_state_idx\" ON \"DocumentVersion\"(\"generatedDocumentId\", \"state\")");
  await prismaWithRaw.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"ElectronicSignature_organizationId_recordType_recordId_recordVersionId_idx\" ON \"ElectronicSignature\"(\"organizationId\", \"recordType\", \"recordId\", \"recordVersionId\")");
  await prismaWithRaw.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"ElectronicSignature_organizationId_signedAt_idx\" ON \"ElectronicSignature\"(\"organizationId\", \"signedAt\")");
  await prismaWithRaw.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RetentionPolicy" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "auditEventRetentionDays" INTEGER,
      "documentVersionRetentionDays" INTEGER,
      "legalHoldEnabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prismaWithRaw.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS \"RetentionPolicy_organizationId_key\" ON \"RetentionPolicy\"(\"organizationId\")");
  await prismaWithRaw.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LegalHold" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "recordType" TEXT NOT NULL,
      "recordId" TEXT NOT NULL,
      "recordVersionId" TEXT,
      "reason" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdByUserId" TEXT NOT NULL,
      "releasedByUserId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "releasedAt" DATETIME
    )
  `);
  await prismaWithRaw.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"LegalHold_organizationId_recordType_recordId_isActive_idx\" ON \"LegalHold\"(\"organizationId\", \"recordType\", \"recordId\", \"isActive\")");
  await prismaWithRaw.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RetentionPurgeRun" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "actorUserId" TEXT NOT NULL,
      "dryRun" BOOLEAN NOT NULL DEFAULT true,
      "reportJson" TEXT NOT NULL,
      "reportHash" TEXT NOT NULL,
      "signature" TEXT NOT NULL,
      "reportPath" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prismaWithRaw.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"RetentionPurgeRun_organizationId_createdAt_idx\" ON \"RetentionPurgeRun\"(\"organizationId\", \"createdAt\")");
  await prismaWithRaw.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AccessReviewReport" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "generatedByUserId" TEXT NOT NULL,
      "reportJson" TEXT NOT NULL,
      "reportHash" TEXT NOT NULL,
      "reportPath" TEXT NOT NULL,
      "reportFormat" TEXT NOT NULL DEFAULT 'csv',
      "attestedSignatureId" TEXT,
      "attestedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prismaWithRaw.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"AccessReviewReport_organizationId_createdAt_idx\" ON \"AccessReviewReport\"(\"organizationId\", \"createdAt\")");
  await prismaWithRaw.$executeRawUnsafe("UPDATE \"DocumentTemplate\" SET \"templateId\" = \"id\" WHERE \"templateId\" IS NULL OR trim(\"templateId\") = ''");
  await prismaWithRaw.$executeRawUnsafe("UPDATE \"DocumentTemplate\" SET \"status\" = CASE WHEN \"isPrimary\" = 1 THEN 'APPROVED' ELSE COALESCE(\"status\", 'DRAFT') END");
  await prismaWithRaw.$executeRawUnsafe("UPDATE \"DocumentTemplate\" SET \"approvedAt\" = COALESCE(\"approvedAt\", \"createdAt\") WHERE \"status\" = 'APPROVED'");
  await prismaWithRaw.$executeRawUnsafe("UPDATE \"DocumentTemplate\" SET \"effectiveDate\" = COALESCE(\"effectiveDate\", \"approvedAt\") WHERE \"status\" = 'APPROVED'");
  await prismaWithRaw.$executeRawUnsafe(`
    UPDATE "Organization"
    SET "isActive" = CASE
      WHEN "id" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) THEN true
      ELSE false
    END
  `);

  // Legacy value normalization for historical data before DocType enum stabilized.
  // If both IQOQ and IOQ exist for the same organization, keep IOQ and remove IQOQ duplicate first.
  // Same for RA -> RID rename.
  await prismaWithRaw.$executeRawUnsafe(`
    DELETE FROM "DocumentTemplate"
    WHERE "docType" = 'IQOQ'
      AND EXISTS (
        SELECT 1
        FROM "DocumentTemplate" AS "existing"
        WHERE "existing"."organizationId" = "DocumentTemplate"."organizationId"
          AND "existing"."docType" = 'IOQ'
      )
  `);
  await prismaWithRaw.$executeRawUnsafe(`
    DELETE FROM "DocumentTemplate"
    WHERE "docType" = 'RA'
      AND EXISTS (
        SELECT 1
        FROM "DocumentTemplate" AS "existing"
        WHERE "existing"."organizationId" = "DocumentTemplate"."organizationId"
          AND "existing"."docType" = 'RID'
      )
  `);
  await prismaWithRaw.$executeRawUnsafe("UPDATE \"DocumentTemplate\" SET \"docType\" = 'IOQ' WHERE \"docType\" = 'IQOQ'");
  await prismaWithRaw.$executeRawUnsafe("UPDATE \"DocumentTemplate\" SET \"docType\" = 'RID' WHERE \"docType\" = 'RA'");
  await prismaWithRaw.$executeRawUnsafe("UPDATE \"GeneratedDocument\" SET \"docType\" = 'IOQ' WHERE \"docType\" = 'IQOQ'");
  await prismaWithRaw.$executeRawUnsafe("UPDATE \"GeneratedDocument\" SET \"docType\" = 'RID' WHERE \"docType\" = 'RA'");

  // Remove legacy placeholder templates that were seeded without uploaded source files.
  await prismaWithRaw.$executeRawUnsafe(`
    DELETE FROM "DocumentTemplate"
    WHERE "sourceFilePath" IS NULL
      AND "title" IN (
        'URS Template',
        'SIA Template',
        'RID Template',
        'DIA Template',
        'IOQ Template',
        'OQ Template',
        'PROTOCOL_SUMMARY Template',
        'SUMMARY Template',
        'EXECUTED_PROTOCOL Template',
        'TRACEABILITY Template'
      )
  `);
};
