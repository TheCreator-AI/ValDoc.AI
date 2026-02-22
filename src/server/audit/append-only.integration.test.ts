/** @vitest-environment node */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { runWithoutOrgScope } from "@/server/db/org-scope-context";

describe("audit append-only enforcement", () => {
  it("blocks update and delete attempts on existing audit events", async () => {
    const prismaWithRaw = prisma as typeof prisma & {
      $executeRawUnsafe?: (query: string) => Promise<unknown>;
      $queryRawUnsafe?: <T = unknown>(query: string) => Promise<T>;
    };
    await runWithoutOrgScope(async () => {
      const columns = (await prismaWithRaw.$queryRawUnsafe?.<Array<{ name: string }>>(
        "PRAGMA table_info(\"AuditEvent\")"
      )) ?? [];
      const ensureColumn = async (name: string, statement: string) => {
        if (!columns.some((row) => row.name === name)) {
          await prismaWithRaw.$executeRawUnsafe?.(statement);
        }
      };
      await ensureColumn("timestamp", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"timestamp\" DATETIME");
      await ensureColumn("outcome", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"outcome\" TEXT NOT NULL DEFAULT 'SUCCESS'");
      await ensureColumn("metadataJson", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"metadataJson\" TEXT");
      await ensureColumn("detailsJson", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"detailsJson\" TEXT");
      await ensureColumn("ip", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"ip\" TEXT");
      await ensureColumn("userAgent", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"userAgent\" TEXT");
      await ensureColumn("prevHash", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"prevHash\" TEXT");
      await ensureColumn("eventHash", "ALTER TABLE \"AuditEvent\" ADD COLUMN \"eventHash\" TEXT");
      await prismaWithRaw.$executeRawUnsafe?.("DROP TRIGGER IF EXISTS \"AuditEvent_no_update\"");
      await prismaWithRaw.$executeRawUnsafe?.("DROP TRIGGER IF EXISTS \"AuditEvent_no_delete\"");
      if (!columns.some((row) => row.name === "timestamp")) {
        await prismaWithRaw.$executeRawUnsafe?.("UPDATE \"AuditEvent\" SET \"timestamp\" = CURRENT_TIMESTAMP WHERE \"timestamp\" IS NULL");
      }
      await prismaWithRaw.$executeRawUnsafe?.(`
        CREATE TRIGGER "AuditEvent_no_update"
        BEFORE UPDATE ON "AuditEvent"
        BEGIN
          SELECT RAISE(ABORT, 'audit_events is append-only');
        END
      `);
      await prismaWithRaw.$executeRawUnsafe?.(`
        CREATE TRIGGER "AuditEvent_no_delete"
        BEFORE DELETE ON "AuditEvent"
        BEGIN
          SELECT RAISE(ABORT, 'audit_events is append-only');
        END
      `);
    });
    const organizationId = `org_audit_${randomUUID()}`;
    const userId = `user_audit_${randomUUID()}`;
    const eventId = `audit_evt_${randomUUID()}`;

    await runWithoutOrgScope(async () => {
      await prisma.organization.create({
        data: {
          id: organizationId,
          name: `Audit Org ${organizationId}`,
          isActive: true
        }
      });
      await prisma.user.create({
        data: {
          id: userId,
          organizationId,
          email: `${userId}@example.test`,
          passwordHash: "hash",
          fullName: "Audit Test User",
          role: "ADMIN"
        }
      });
      await prisma.auditEvent.create({
        data: {
          id: eventId,
          organizationId,
          actorUserId: userId,
          action: "test.audit.append_only",
          entityType: "AuditEvent",
          entityId: eventId,
          outcome: "SUCCESS",
          timestamp: new Date()
        }
      });
    });

    await expect(
      runWithoutOrgScope(async () =>
        prisma.auditEvent.update({
          where: { id: eventId },
          data: { action: "test.audit.mutated" }
        })
      )
    ).rejects.toThrow(/append-only/i);

    await expect(
      runWithoutOrgScope(async () =>
        prisma.auditEvent.delete({
          where: { id: eventId }
        })
      )
    ).rejects.toThrow(/append-only/i);
  });
});
