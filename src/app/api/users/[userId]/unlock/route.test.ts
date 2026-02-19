import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { ApiError } from "@/server/api/http";
import { PATCH } from "./route";

describe("PATCH /api/users/:userId/unlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrowWithPermission.mockResolvedValue({
      userId: "admin1",
      organizationId: "org1",
      role: "ADMIN"
    });
    mocks.writeAuditEvent.mockResolvedValue(undefined);
  });

  it("unlocks a locked user", async () => {
    mocks.userFindFirst.mockResolvedValueOnce({
      id: "u1",
      organizationId: "org1",
      email: "user@org.com",
      userStatus: "LOCKED"
    });
    mocks.userUpdate.mockResolvedValueOnce({
      id: "u1",
      email: "user@org.com",
      userStatus: "ACTIVE",
      failedLoginAttempts: 0
    });

    const response = await PATCH(new Request("http://localhost/api/users/u1/unlock", { method: "PATCH" }), {
      params: Promise.resolve({ userId: "u1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ id: "u1", userStatus: "ACTIVE", failedLoginAttempts: 0 })
    );
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ userStatus: "ACTIVE", failedLoginAttempts: 0, lockedAt: null })
      })
    );
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.unlock" }));
  });

  it("returns 404 when user is missing", async () => {
    mocks.userFindFirst.mockResolvedValueOnce(null);

    const response = await PATCH(new Request("http://localhost/api/users/u1/unlock", { method: "PATCH" }), {
      params: Promise.resolve({ userId: "u1" })
    });

    expect(response.status).toBe(404);
  });

  it("returns 403 for unauthorized caller", async () => {
    mocks.getSessionOrThrowWithPermission.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));

    const response = await PATCH(new Request("http://localhost/api/users/u1/unlock", { method: "PATCH" }), {
      params: Promise.resolve({ userId: "u1" })
    });

    expect(response.status).toBe(403);
  });
});
