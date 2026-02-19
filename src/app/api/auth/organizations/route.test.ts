import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    organization: { findMany },
    $executeRawUnsafe: vi.fn()
  }
}));

import { GET } from "./route";

describe("GET /api/auth/organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active organizations for login selection", async () => {
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
});

