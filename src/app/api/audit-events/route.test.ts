import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  auditFindMany: vi.fn()
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
    auditEvent: {
      findMany: mocks.auditFindMany
    }
  }
}));

import * as routeModule from "./route";
const { GET } = routeModule;

describe("GET /api/audit-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrowWithPermission.mockResolvedValue({
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
        metadataJson: "{\"email\":\"andrew@qa.org\"}",
        detailsJson: "{\"email\":\"andrew@qa.org\"}",
        ip: "127.0.0.1",
        userAgent: "Vitest",
        actor: { email: "andrew@qa.org", fullName: "Andrew", role: "ADMIN" }
      }
    ]);
  });

  it("returns filtered audit events for admin", async () => {
    const response = await GET(
      new Request("http://localhost/api/audit-events?action=auth.login.success&entityType=User&outcome=success")
    );
    expect(response.status).toBe(200);
    expect(mocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org1",
          action: "auth.login.success",
          entityType: "User",
          outcome: "SUCCESS"
        })
      })
    );
  });

  it("exports CSV when format=csv", async () => {
    const response = await GET(new Request("http://localhost/api/audit-events?format=csv"));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("timestamp,action,entity_type");
    expect(text).toContain("outcome");
    expect(text).toContain("auth.login.success");
  });

  it("enforces admin authorization", async () => {
    mocks.getSessionOrThrowWithPermission.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await GET(new Request("http://localhost/api/audit-events"));
    expect(response.status).toBe(403);
  });

  it("does not expose mutation handlers", () => {
    expect((routeModule as Record<string, unknown>).POST).toBeUndefined();
    expect((routeModule as Record<string, unknown>).PUT).toBeUndefined();
    expect((routeModule as Record<string, unknown>).PATCH).toBeUndefined();
    expect((routeModule as Record<string, unknown>).DELETE).toBeUndefined();
  });
});
