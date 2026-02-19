import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  organizationCount: vi.fn(),
  organizationFindUniqueOrThrow: vi.fn(),
  userFindUniqueOrThrow: vi.fn(),
  hash: vi.fn(),
  writeAuditEvent: vi.fn(),
  provisionDeployment: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    organization: {
      count: mocks.organizationCount,
      findUniqueOrThrow: mocks.organizationFindUniqueOrThrow
    },
    user: {
      findUniqueOrThrow: mocks.userFindUniqueOrThrow
    }
  }
}));

vi.mock("bcryptjs", () => ({
  hash: mocks.hash
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

vi.mock("@/server/setup/provision", () => ({
  provisionDeployment: mocks.provisionDeployment
}));

import { POST } from "./route";

describe("POST /api/setup/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("hash");
  });

  it("creates first organization and admin when setup is required", async () => {
    mocks.organizationCount.mockResolvedValueOnce(0);
    mocks.provisionDeployment.mockResolvedValueOnce({
      organizationId: "test-customer",
      organizationName: "Test Organization",
      adminEmail: "admin@acme.com",
      adminCreated: true,
      roles: ["ADMIN", "AUTHOR", "REVIEWER", "VIEWER"]
    });
    mocks.organizationFindUniqueOrThrow.mockResolvedValueOnce({ id: "test-customer", name: "Test Organization" });
    mocks.userFindUniqueOrThrow.mockResolvedValueOnce({ id: "u1", email: "admin@acme.com", fullName: "Admin", role: "ADMIN" });

    const response = await POST(
      new Request("http://localhost/api/setup/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationName: "Acme Bio",
          adminEmail: "admin@acme.com",
          adminFullName: "Admin",
          adminPassword: "Password123!"
        })
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.provisionDeployment).toHaveBeenCalled();
    expect(mocks.organizationFindUniqueOrThrow).toHaveBeenCalled();
    expect(mocks.userFindUniqueOrThrow).toHaveBeenCalled();
  });

  it("disables bootstrap once org exists", async () => {
    mocks.organizationCount.mockResolvedValueOnce(1);
    const response = await POST(
      new Request("http://localhost/api/setup/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationName: "Acme Bio",
          adminEmail: "admin@acme.com",
          adminFullName: "Admin",
          adminPassword: "Password123!"
        })
      })
    );
    expect(response.status).toBe(409);
  });
});
