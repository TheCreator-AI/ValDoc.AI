import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  auditFindMany: vi.fn(),
  chainHeadFindUnique: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrowWithPermission: mocks.getSessionOrThrowWithPermission
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    auditEvent: { findMany: mocks.auditFindMany },
    auditChainHead: { findUnique: mocks.chainHeadFindUnique }
  }
}));

import { GET } from "./route";
import { computeEventHash } from "@/server/audit/chain";

describe("GET /api/admin/audit/verify-chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrowWithPermission.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN"
    });
  });

  it("returns pass for valid chain", async () => {
    const payload1 = {
      organizationId: "org1",
      actorUserId: "u1",
      action: "a1",
      entityType: "t1",
      entityId: "e1",
      outcome: "SUCCESS" as const,
      metadataJson: null,
      detailsJson: null,
      ip: null,
      userAgent: null,
      timestampIso: "2026-02-18T00:00:00.000Z"
    };
    const hash1 = computeEventHash("", payload1);
    mocks.auditFindMany.mockResolvedValue([
      {
        id: "ev1",
        prevHash: "",
        eventHash: hash1,
        organizationId: "org1",
        actorUserId: "u1",
        action: "a1",
        entityType: "t1",
        entityId: "e1",
        outcome: "SUCCESS",
        metadataJson: null,
        detailsJson: null,
        ip: null,
        userAgent: null,
        timestamp: new Date(payload1.timestampIso)
      }
    ]);
    mocks.chainHeadFindUnique.mockResolvedValue({ headHash: hash1 });

    const response = await GET(new Request("http://localhost/api/admin/audit/verify-chain"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pass).toBe(true);
  });

  it("returns broken event id for tampered chain", async () => {
    mocks.auditFindMany.mockResolvedValue([
      {
        id: "ev1",
        prevHash: "",
        eventHash: "bad-hash",
        organizationId: "org1",
        actorUserId: "u1",
        action: "a1",
        entityType: "t1",
        entityId: "e1",
        outcome: "SUCCESS",
        metadataJson: null,
        detailsJson: null,
        ip: null,
        userAgent: null,
        timestamp: new Date("2026-02-18T00:00:00.000Z")
      }
    ]);
    mocks.chainHeadFindUnique.mockResolvedValue({ headHash: "bad-hash" });

    const response = await GET(new Request("http://localhost/api/admin/audit/verify-chain"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pass).toBe(false);
    expect(body.firstBrokenEventId).toBe("ev1");
  });

  it("enforces permission", async () => {
    mocks.getSessionOrThrowWithPermission.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await GET(new Request("http://localhost/api/admin/audit/verify-chain"));
    expect(response.status).toBe(403);
  });
});
