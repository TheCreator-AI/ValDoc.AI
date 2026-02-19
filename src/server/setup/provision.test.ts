import { beforeEach, describe, expect, it, vi } from "vitest";
import { provisionDeployment } from "@/server/setup/provision";

const mocks = vi.hoisted(() => ({
  organizationFindMany: vi.fn(),
  organizationUpsert: vi.fn(),
  organizationUpdateMany: vi.fn(),
  deploymentConfigUpsert: vi.fn(),
  deploymentRoleUpsert: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn()
}));

describe("provisionDeployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organizationFindMany.mockResolvedValue([]);
    mocks.organizationUpsert.mockResolvedValue({ id: "qa-org", name: "QA Organization" });
    mocks.organizationUpdateMany.mockResolvedValue({ count: 0 });
    mocks.deploymentConfigUpsert.mockResolvedValue({ id: "singleton", customerId: "qa-org" });
    mocks.deploymentRoleUpsert.mockResolvedValue({});
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({ id: "admin1", email: "admin@qa.org", role: "ADMIN" });
  });

  it("creates deployment config, default roles, and admin on a fresh database", async () => {
    const result = await provisionDeployment(
      {
        customerId: "qa-org",
        orgName: "QA Organization",
        adminEmail: "admin@qa.org",
        adminFullName: "QA Admin",
        adminPasswordHash: "hashed-password"
      },
      {
        organization: {
          findMany: mocks.organizationFindMany,
          upsert: mocks.organizationUpsert,
          updateMany: mocks.organizationUpdateMany
        },
        deploymentConfig: {
          upsert: mocks.deploymentConfigUpsert
        },
        deploymentRole: {
          upsert: mocks.deploymentRoleUpsert
        },
        user: {
          findUnique: mocks.userFindUnique,
          create: mocks.userCreate
        }
      }
    );

    expect(result.organizationId).toBe("qa-org");
    expect(result.adminCreated).toBe(true);
    expect(result.roles).toEqual(["ADMIN", "USER", "APPROVER", "REVIEWER", "VIEWER", "AUTHOR", "ENGINEER"]);
    expect(mocks.deploymentRoleUpsert).toHaveBeenCalledTimes(7);
    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "qa-org",
          role: "ADMIN"
        })
      })
    );
  });
});
