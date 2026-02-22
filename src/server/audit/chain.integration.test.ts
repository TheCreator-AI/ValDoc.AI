/** @vitest-environment node */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { runWithoutOrgScope } from "@/server/db/org-scope-context";
import { computeEventHash, verifyAuditChain } from "@/server/audit/chain";

const ensureAuditColumns = async () => {
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
    if (!columns.some((row) => row.name === "timestamp")) {
      await prismaWithRaw.$executeRawUnsafe?.("UPDATE \"AuditEvent\" SET \"timestamp\" = CURRENT_TIMESTAMP WHERE \"timestamp\" IS NULL");
    }
  });
};

describe("audit chain integration", () => {
  it("passes for valid sequence, fails on tamper, and rejects mixed organizations", async () => {
    await ensureAuditColumns();

    const orgA = `org_chain_a_${randomUUID()}`;
    const orgB = `org_chain_b_${randomUUID()}`;
    const userA = `user_chain_a_${randomUUID()}`;
    const userB = `user_chain_b_${randomUUID()}`;

    const t1 = new Date("2026-02-20T00:00:00.000Z");
    const t2 = new Date("2026-02-20T00:01:00.000Z");
    const p1 = {
      organizationId: orgA,
      actorUserId: userA,
      action: "doc.create",
      entityType: "GeneratedDocument",
      entityId: "doc-1",
      outcome: "SUCCESS" as const,
      metadataJson: "{\"a\":1}",
      detailsJson: "{\"a\":1}",
      ip: null,
      userAgent: "Vitest",
      timestampIso: t1.toISOString()
    };
    const h1 = computeEventHash("", p1);
    const p2 = {
      ...p1,
      action: "doc.approve",
      entityId: "doc-2",
      timestampIso: t2.toISOString()
    };
    const h2 = computeEventHash(h1, p2);

    await runWithoutOrgScope(async () => {
      await prisma.organization.createMany({
        data: [
          { id: orgA, name: `Org ${orgA}`, isActive: true },
          { id: orgB, name: `Org ${orgB}`, isActive: true }
        ]
      });
      await prisma.user.createMany({
        data: [
          {
            id: userA,
            organizationId: orgA,
            email: `${userA}@example.test`,
            passwordHash: "hash",
            fullName: "User A",
            role: "ADMIN"
          },
          {
            id: userB,
            organizationId: orgB,
            email: `${userB}@example.test`,
            passwordHash: "hash",
            fullName: "User B",
            role: "ADMIN"
          }
        ]
      });
      await prisma.auditEvent.createMany({
        data: [
          {
            id: `evt_a_1_${randomUUID()}`,
            organizationId: orgA,
            actorUserId: userA,
            action: p1.action,
            entityType: p1.entityType,
            entityId: p1.entityId,
            outcome: "SUCCESS",
            metadataJson: p1.metadataJson,
            detailsJson: p1.detailsJson,
            prevHash: "",
            eventHash: h1,
            timestamp: t1,
            ip: null,
            userAgent: "Vitest"
          },
          {
            id: `evt_a_2_${randomUUID()}`,
            organizationId: orgA,
            actorUserId: userA,
            action: p2.action,
            entityType: p2.entityType,
            entityId: p2.entityId,
            outcome: "SUCCESS",
            metadataJson: p2.metadataJson,
            detailsJson: p2.detailsJson,
            prevHash: h1,
            eventHash: h2,
            timestamp: t2,
            ip: null,
            userAgent: "Vitest"
          }
        ]
      });
      await prisma.auditEvent.create({
        data: {
          id: `evt_b_1_${randomUUID()}`,
          organizationId: orgB,
          actorUserId: userB,
          action: "auth.login.success",
          entityType: "User",
          entityId: userB,
          outcome: "SUCCESS",
          metadataJson: "{\"org\":\"b\"}",
          detailsJson: "{\"org\":\"b\"}",
          prevHash: "",
          eventHash: computeEventHash("", {
            organizationId: orgB,
            actorUserId: userB,
            action: "auth.login.success",
            entityType: "User",
            entityId: userB,
            outcome: "SUCCESS",
            metadataJson: "{\"org\":\"b\"}",
            detailsJson: "{\"org\":\"b\"}",
            ip: null,
            userAgent: "Vitest",
            timestampIso: t1.toISOString()
          }),
          timestamp: t1,
          ip: null,
          userAgent: "Vitest"
        }
      });
      await prisma.auditChainHead.upsert({
        where: { organizationId: orgA },
        create: { organizationId: orgA, headHash: h2 },
        update: { headHash: h2 }
      });
    });

    const orgAEvents = await runWithoutOrgScope(async () =>
      prisma.auditEvent.findMany({
        where: { organizationId: orgA },
        orderBy: [{ timestamp: "asc" }, { id: "asc" }],
        select: {
          id: true,
          prevHash: true,
          eventHash: true,
          organizationId: true,
          actorUserId: true,
          action: true,
          entityType: true,
          entityId: true,
          outcome: true,
          metadataJson: true,
          detailsJson: true,
          ip: true,
          userAgent: true,
          timestamp: true
        }
      })
    );

    const passResult = verifyAuditChain(
      orgAEvents.map((event) => ({
        id: event.id,
        prevHash: event.prevHash,
        eventHash: event.eventHash,
        payload: {
          organizationId: event.organizationId,
          actorUserId: event.actorUserId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          outcome: event.outcome,
          metadataJson: event.metadataJson,
          detailsJson: event.detailsJson,
          ip: event.ip,
          userAgent: event.userAgent,
          timestampIso: event.timestamp.toISOString()
        }
      }))
    );
    expect(passResult.ok).toBe(true);

    let dbTamperApplied = false;
    await runWithoutOrgScope(async () => {
      const prismaWithRaw = prisma as typeof prisma & { $executeRawUnsafe?: (query: string) => Promise<unknown> };
      try {
        await prismaWithRaw.$executeRawUnsafe?.("DROP TRIGGER IF EXISTS \"AuditEvent_no_update\"");
        await prismaWithRaw.$executeRawUnsafe?.(
          `UPDATE "AuditEvent" SET "action" = 'tampered.action' WHERE "organizationId" = '${orgA}' AND "prevHash" != ''`
        );
        dbTamperApplied = true;
      } finally {
        await prismaWithRaw.$executeRawUnsafe?.(`
          CREATE TRIGGER IF NOT EXISTS "AuditEvent_no_update"
          BEFORE UPDATE ON "AuditEvent"
          BEGIN
            SELECT RAISE(ABORT, 'audit_events is append-only');
          END
        `);
      }
    }).catch(() => {
      // Append-only hardening can block direct DB tampering in parallel test runs.
      // In that case, we still validate verifier behavior by mutating a fetched payload copy below.
    });

    const fetchedEvents = await runWithoutOrgScope(async () =>
      prisma.auditEvent.findMany({
        where: { organizationId: orgA },
        orderBy: [{ timestamp: "asc" }, { id: "asc" }],
        select: {
          id: true,
          prevHash: true,
          eventHash: true,
          organizationId: true,
          actorUserId: true,
          action: true,
          entityType: true,
          entityId: true,
          outcome: true,
          metadataJson: true,
          detailsJson: true,
          ip: true,
          userAgent: true,
          timestamp: true
        }
      })
    );
    const tamperedEvents = dbTamperApplied
      ? fetchedEvents
      : fetchedEvents.map((event, index) =>
          index === 1
            ? {
                ...event,
                action: "tampered.action"
              }
            : event
        );
    const failResult = verifyAuditChain(
      tamperedEvents.map((event) => ({
        id: event.id,
        prevHash: event.prevHash,
        eventHash: event.eventHash,
        payload: {
          organizationId: event.organizationId,
          actorUserId: event.actorUserId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          outcome: event.outcome,
          metadataJson: event.metadataJson,
          detailsJson: event.detailsJson,
          ip: event.ip,
          userAgent: event.userAgent,
          timestampIso: event.timestamp.toISOString()
        }
      }))
    );
    expect(failResult.ok).toBe(false);

    const orgBEvents = await runWithoutOrgScope(async () =>
      prisma.auditEvent.findMany({
        where: { organizationId: orgB },
        orderBy: [{ timestamp: "asc" }, { id: "asc" }],
        select: {
          id: true,
          prevHash: true,
          eventHash: true,
          organizationId: true,
          actorUserId: true,
          action: true,
          entityType: true,
          entityId: true,
          outcome: true,
          metadataJson: true,
          detailsJson: true,
          ip: true,
          userAgent: true,
          timestamp: true
        }
      })
    );
    const mixed = verifyAuditChain(
      [...orgAEvents, ...orgBEvents].map((event) => ({
        id: event.id,
        prevHash: event.prevHash,
        eventHash: event.eventHash,
        payload: {
          organizationId: event.organizationId,
          actorUserId: event.actorUserId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          outcome: event.outcome,
          metadataJson: event.metadataJson,
          detailsJson: event.detailsJson,
          ip: event.ip,
          userAgent: event.userAgent,
          timestampIso: event.timestamp.toISOString()
        }
      }))
    );
    expect(mixed.ok).toBe(false);
    expect(mixed.reason).toBe("organization_mismatch");
  });
});
