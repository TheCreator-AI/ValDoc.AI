import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
}));
const { ensureDatabaseInitialized } = vi.hoisted(() => ({
  ensureDatabaseInitialized: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    organization: { findMany },
    $executeRawUnsafe: vi.fn()
  }
}));

vi.mock("@/server/db/bootstrap", () => ({
  ensureDatabaseInitialized
}));

import { GET } from "./route";

describe("GET /api/auth/organizations", () => {
  const originalCustomerId = process.env.CUSTOMER_ID;
  const originalOrgName = process.env.ORG_NAME;

  beforeEach(() => {
    vi.clearAllMocks();
    ensureDatabaseInitialized.mockResolvedValue(undefined);
    process.env.CUSTOMER_ID = originalCustomerId;
    process.env.ORG_NAME = originalOrgName;
  });

  it("returns deployment organization and enforces single active org when env is configured", async () => {
    process.env.CUSTOMER_ID = "amnion";
    process.env.ORG_NAME = "Amnion";

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([{ id: "amnion", name: "Amnion" }]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns active organizations for login selection when deployment org env is unavailable", async () => {
    process.env.CUSTOMER_ID = "";
    process.env.ORG_NAME = "";
    findMany.mockResolvedValueOnce([
      { id: "org_amnion", name: "Amnion" },
      { id: "org_beta", name: "Beta Bio" }
    ]);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([
      { id: "org_amnion", name: "Amnion" },
      { id: "org_beta", name: "Beta Bio" }
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    });
  });

  it("returns deployment organization even when db bootstrap fails", async () => {
    process.env.CUSTOMER_ID = "amnion";
    process.env.ORG_NAME = "Amnion";
    ensureDatabaseInitialized.mockRejectedValueOnce(new Error("db unavailable"));

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([{ id: "amnion", name: "Amnion" }]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
