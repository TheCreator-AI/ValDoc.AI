import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuditEvent: vi.fn(),
  findChainHead: vi.fn(),
  upsertChainHead: vi.fn(),
  tx: vi.fn(),
  emitAuditEventToSink: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: mocks.tx
  }
}));

vi.mock("@/server/audit/sink", () => ({
  emitAuditEventToSink: mocks.emitAuditEventToSink
}));

import { writeAuditEvent } from "@/server/audit/events";

describe("writeAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findChainHead.mockResolvedValue(null);
    mocks.upsertChainHead.mockResolvedValue({ organizationId: "org1", headHash: "head" });
    mocks.createAuditEvent.mockResolvedValue({ id: "a1" });
    mocks.emitAuditEventToSink.mockResolvedValue({ forwarded: true });
    mocks.tx.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        auditEvent: { create: mocks.createAuditEvent },
        auditChainHead: {
          findUnique: mocks.findChainHead,
          upsert: mocks.upsertChainHead
        }
      })
    );
  });

  it("writes success outcome by default with metadata", async () => {
    await writeAuditEvent({
      organizationId: "org1",
      actorUserId: "u1",
      action: "template.create",
      entityType: "DocumentTemplate",
      entityId: "t1",
      details: { docType: "URS" },
      request: new Request("http://localhost", { headers: { "user-agent": "Vitest" } })
    });

    expect(mocks.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: "SUCCESS",
          metadataJson: expect.any(String),
          detailsJson: expect.any(String),
          prevHash: expect.any(String),
          eventHash: expect.any(String)
        })
      })
    );
    expect(mocks.upsertChainHead).toHaveBeenCalled();
  });

  it("forwards persisted audit events to external sink", async () => {
    await writeAuditEvent({
      organizationId: "org1",
      actorUserId: "u1",
      action: "template.create",
      entityType: "DocumentTemplate",
      entityId: "t1"
    });

    expect(mocks.emitAuditEventToSink).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "a1",
        organizationId: "org1",
        action: "template.create",
        eventHash: expect.any(String),
        prevHash: expect.any(String)
      })
    );
  });

  it("writes denied outcome when specified", async () => {
    await writeAuditEvent({
      organizationId: "org1",
      actorUserId: "u1",
      action: "authz.denied",
      entityType: "Permission",
      entityId: "templates.create",
      outcome: "DENIED"
    });

    expect(mocks.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "authz.denied",
          outcome: "DENIED"
        })
      })
    );
  });

  it("writes field-level changes when provided", async () => {
    await writeAuditEvent({
      organizationId: "org1",
      actorUserId: "u1",
      action: "document.version.create",
      entityType: "DocumentVersion",
      entityId: "v2",
      fieldChanges: [
        {
          changePath: "requirements[3].acceptance_criteria",
          oldValue: "D",
          newValue: "Updated"
        }
      ]
    });

    expect(mocks.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: {
            create: [
              {
                changePath: "requirements[3].acceptance_criteria",
                oldValue: "D",
                newValue: "Updated"
              }
            ]
          }
        })
      })
    );
  });

  it("uses server-generated timestamp even if details contain client timestamp", async () => {
    await writeAuditEvent({
      organizationId: "org1",
      actorUserId: "u1",
      action: "document.version.transition",
      entityType: "DocumentVersion",
      entityId: "v2",
      details: {
        clientTimestamp: "1999-01-01T00:00:00.000Z"
      }
    });

    expect(mocks.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timestamp: expect.any(Date)
        })
      })
    );
  });
});
