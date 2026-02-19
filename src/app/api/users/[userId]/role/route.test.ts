import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  writeAuditEvent: vi.fn()
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
    user: {
      findFirst: mocks.userFindFirst,
      update: mocks.userUpdate
    }
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { PATCH } from "./route";

describe("PATCH /api/users/:userId/role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrowWithPermission.mockResolvedValue({
      userId: "admin-1",
      organizationId: "org1",
      role: "ADMIN"
    });
    mocks.userFindFirst.mockResolvedValue({
      id: "u2",
      organizationId: "org1",
      role: "USER",
      email: "emily@qp.org"
    });
    mocks.userUpdate.mockResolvedValue({
      id: "u2",
      email: "emily@qp.org",
      fullName: "Emily",
      role: "REVIEWER"
    });
  });

  it("updates role and writes audit event", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/users/u2/role", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "REVIEWER" })
      }),
      { params: Promise.resolve({ userId: "u2" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.role_change",
        entityType: "User",
        entityId: "u2"
      })
    );
  });

  it("denies reviewer from changing user roles", async () => {
    mocks.getSessionOrThrowWithPermission.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await PATCH(
      new Request("http://localhost/api/users/u2/role", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "USER" })
      }),
      { params: Promise.resolve({ userId: "u2" }) }
    );
    expect(response.status).toBe(403);
  });

  it("rejects unsupported role values", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/users/u2/role", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "VIEWER" })
      }),
      { params: Promise.resolve({ userId: "u2" }) }
    );
    expect(response.status).toBe(400);
  });
});
