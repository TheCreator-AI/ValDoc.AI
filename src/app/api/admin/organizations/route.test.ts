import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  assertSystemOwnerOrThrow: vi.fn(),
  findMany: vi.fn(),
  createOrg: vi.fn(),
  createUser: vi.fn(),
  writeAuditEvent: vi.fn(),
  hashPassword: vi.fn(),
  getPasswordPolicyErrors: vi.fn()
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
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        organization: { create: mocks.createOrg },
        user: { create: mocks.createUser }
      }),
    organization: {
      findMany: mocks.findMany,
      create: mocks.createOrg
    },
    user: {
      create: mocks.createUser
    }
  }
}));

vi.mock("@/server/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  getPasswordPolicyErrors: mocks.getPasswordPolicyErrors
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { GET, POST } from "./route";

describe("admin organizations route", () => {
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
    mocks.getPasswordPolicyErrors.mockReturnValue([]);
  });

  it("lists organizations for system owner", async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: "org1", name: "Amnion", isActive: true, _count: { users: 1 } }]);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[0].name).toBe("Amnion");
  });

  it("creates organization with initial admin", async () => {
    mocks.hashPassword.mockResolvedValueOnce("hashed");
    mocks.createOrg.mockResolvedValueOnce({ id: "org2", name: "Beta Org", isActive: true });
    mocks.createUser.mockResolvedValueOnce({ id: "u2", email: "admin@beta.org", fullName: "Beta Admin", role: "ADMIN" });

    const response = await POST(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Beta Org",
          adminEmail: "admin@beta.org",
          adminFullName: "Beta Admin",
          adminPassword: "Password123!"
        })
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.organization.name).toBe("Beta Org");
    expect(body.admin.email).toBe("admin@beta.org");
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "organization.create" }));
  });
});
