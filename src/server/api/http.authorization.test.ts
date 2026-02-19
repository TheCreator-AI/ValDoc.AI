import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, assertPermissionOrThrow } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  writeAuditEvent: vi.fn()
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

describe("assertPermissionOrThrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs and throws 403 on denied permission", async () => {
    await expect(
      assertPermissionOrThrow({
        session: { userId: "u1", organizationId: "org1", role: "VIEWER" },
        permission: "templates.create",
        request: new Request("http://localhost/api/templates", { method: "POST" })
      })
    ).rejects.toBeInstanceOf(ApiError);

    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authz.denied",
        entityType: "Permission",
        entityId: "templates.create"
      })
    );
  });

  it("allows permitted action without logging denial", async () => {
    await expect(
      assertPermissionOrThrow({
        session: { userId: "u1", organizationId: "org1", role: "ADMIN" },
        permission: "users.manage_roles",
        request: new Request("http://localhost/api/users/u2/role", { method: "PATCH" })
      })
    ).resolves.toBeUndefined();

    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });
});
