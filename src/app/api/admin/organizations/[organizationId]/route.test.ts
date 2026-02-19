import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  assertSystemOwnerOrThrow: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  writeAuditEvent: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/auth/systemOwner", () => ({
  assertSystemOwnerOrThrow: mocks.assertSystemOwnerOrThrow
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    organization: {
      findFirst: mocks.findFirst,
      update: mocks.update
    }
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { DELETE } from "./route";

describe("DELETE /api/admin/organizations/:organizationId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN",
      email: "andrew@qa.org"
    });
    mocks.assertSystemOwnerOrThrow.mockReturnValue(undefined);
    mocks.writeAuditEvent.mockResolvedValue(undefined);
  });

  it("prevents deleting the current organization", async () => {
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ organizationId: "org1" })
    });
    expect(response.status).toBe(400);
  });

  it("soft deletes target organization", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "org2", name: "Beta Org", isActive: true });
    mocks.update.mockResolvedValueOnce({ id: "org2", name: "Beta Org", isActive: false });

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ organizationId: "org2" })
    });
    expect(response.status).toBe(200);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "organization.delete" }));
  });
});

