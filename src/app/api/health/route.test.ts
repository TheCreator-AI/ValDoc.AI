import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  organizationCount: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    organization: {
      count: mocks.organizationCount
    }
  }
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthy when database responds", async () => {
    mocks.organizationCount.mockResolvedValueOnce(1);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
  });

  it("returns unhealthy when database check fails", async () => {
    mocks.organizationCount.mockRejectedValueOnce(new Error("db down"));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("error");
    expect(body.database).toBe("error");
  });
});
