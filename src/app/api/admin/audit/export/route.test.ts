import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  auditFindMany: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    auditEvent: {
      findMany: mocks.auditFindMany
    }
  }
}));

import { GET } from "./route";

describe("GET /api/admin/audit/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "admin-1",
      organizationId: "org1",
      role: "ADMIN"
    });
    mocks.auditFindMany.mockResolvedValue([
      {
        id: "a1",
        timestamp: new Date("2026-02-17T00:00:00.000Z"),
        action: "auth.login.success",
        entityType: "User",
        entityId: "u1",
        outcome: "SUCCESS",
        metadataJson: "{\"event\":\"ok\"}",
        detailsJson: null,
        ip: "127.0.0.1",
        userAgent: "Vitest",
        actor: { email: "admin@org1.test" }
      }
    ]);
  });

  it("exports csv for admin and scopes by organization", async () => {
    const response = await GET(new Request("http://localhost/api/admin/audit/export?action=auth.login.success"));
    expect(response.status).toBe(200);
    expect(mocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org1",
          action: "auth.login.success"
        })
      })
    );
    const text = await response.text();
    expect(text).toContain("timestamp,action,entity_type");
    expect(text).toContain("auth.login.success");
  });

  it("denies non-admin export", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await GET(new Request("http://localhost/api/admin/audit/export"));
    expect(response.status).toBe(403);
  });
});
