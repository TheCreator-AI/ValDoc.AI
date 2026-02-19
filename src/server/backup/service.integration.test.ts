import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { computeEventHash } from "@/server/audit/chain";
import { backupDatabaseEncrypted, verifyRestoreIntegrity } from "@/server/backup/service";

const createClient = (dbPath: string) =>
  new PrismaClient({
    datasourceUrl: `file:${path.resolve(dbPath).replaceAll("\\", "/")}`
  });

const applyMigrationSql = async (client: PrismaClient) => {
  const sql = readFileSync(path.resolve(process.cwd(), "prisma/migrations/0001_init/migration.sql"), "utf8");
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await client.$executeRawUnsafe(statement);
  }
  // Keep the integration DB aligned with Prisma model fields added after 0001_init.
  try {
    await client.$executeRawUnsafe('ALTER TABLE "Organization" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true');
  } catch {
    // no-op if column already exists
  }
  try {
    await client.$executeRawUnsafe('ALTER TABLE "GeneratedDocument" ADD COLUMN "deletedAt" DATETIME');
  } catch {
    // no-op if column already exists
  }
  try {
    await client.$executeRawUnsafe('ALTER TABLE "DocumentVersion" ADD COLUMN "deletedAt" DATETIME');
  } catch {
    // no-op if column already exists
  }
  try {
    await client.$executeRawUnsafe("ALTER TABLE \"User\" ADD COLUMN \"userStatus\" TEXT NOT NULL DEFAULT 'ACTIVE'");
  } catch {
    // no-op if column already exists
  }
  try {
    await client.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false');
  } catch {
    // no-op if column already exists
  }
  try {
    await client.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME');
  } catch {
    // no-op if column already exists
  }
};

describe("backup/restore integration", () => {
  it("backs up encrypted db, restores to fresh db, and verifies integrity", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "valdoc-backup-it-"));
    const dbPath = path.join(tempDir, "source.db");
    const backupDir = path.join(tempDir, "backups");
    const encryptionKey = "integration-test-backup-key";
    const client = createClient(dbPath);
    try {
      await applyMigrationSql(client);

      await client.organization.create({
        data: { id: "org1", name: "Test Org", isActive: true }
      });
      await client.user.create({
        data: {
          id: "u1",
          organizationId: "org1",
          email: "admin@test.org",
          passwordHash: "hash",
          fullName: "Admin",
          role: "ADMIN"
        }
      });
      await client.machine.create({
        data: {
          id: "m1",
          organizationId: "org1",
          name: "Freezer",
          modelNumber: "TSX2320FA20",
          manufacturer: "Thermo"
        }
      });
      await client.generationJob.create({
        data: {
          id: "j1",
          organizationId: "org1",
          machineId: "m1",
          createdByUserId: "u1"
        }
      });
      await client.generatedDocument.create({
        data: {
          id: "d1",
          organizationId: "org1",
          generationJobId: "j1",
          docType: "URS",
          stage: "PRE_EXECUTION",
          title: "URS",
          status: "DRAFT",
          currentContent: "{\"requirements\":[{\"req_id\":\"URS-001\"}]}"
        }
      });
      await client.documentVersion.create({
        data: {
          id: "v1",
          generatedDocumentId: "d1",
          editedByUserId: "u1",
          versionNumber: 1,
          state: "DRAFT",
          contentSnapshot: "{\"requirements\":[{\"req_id\":\"URS-001\"}]}",
          contentHash: "hash-v1",
          changeReason: "initial"
        }
      });

      const createdEvent = await client.auditEvent.create({
        data: {
          id: "a1",
          organizationId: "org1",
          actorUserId: "u1",
          action: "document.version.create",
          entityType: "DocumentVersion",
          entityId: "v1",
          outcome: "SUCCESS",
          metadataJson: "{\"seed\":true}",
          detailsJson: "{\"seed\":true}",
          prevHash: "",
          eventHash: "pending-hash",
          timestamp: new Date("2026-02-18T00:00:00.000Z")
        }
      });
      const hash = computeEventHash("", {
        organizationId: createdEvent.organizationId,
        actorUserId: createdEvent.actorUserId,
        action: createdEvent.action,
        entityType: createdEvent.entityType,
        entityId: createdEvent.entityId,
        outcome: createdEvent.outcome,
        metadataJson: createdEvent.metadataJson,
        detailsJson: createdEvent.detailsJson,
        ip: createdEvent.ip,
        userAgent: createdEvent.userAgent,
        timestampIso: createdEvent.timestamp.toISOString()
      });
      await client.auditEvent.update({
        where: { id: createdEvent.id },
        data: { eventHash: hash }
      });
      await client.auditChainHead.create({
        data: {
          organizationId: "org1",
          headHash: hash
        }
      });

      const backup = await backupDatabaseEncrypted({
        dbPath,
        outputDir: backupDir,
        encryptionKey
      });
      const verification = await verifyRestoreIntegrity({
        backupFile: backup.outputPath,
        tempDir,
        encryptionKey
      });

      expect(verification.pass).toBe(true);
      expect(verification.actual.generatedDocumentCount).toBe(1);
      expect(verification.actual.latestVersionHashes["d1"]).toBe("hash-v1");
      expect(verification.actual.auditChainHead).toBe(hash);
    } finally {
      await client.$disconnect();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);
});
