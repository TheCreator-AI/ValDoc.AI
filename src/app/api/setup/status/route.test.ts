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

describe("GET /api/setup/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns setup required when no organizations exist", async () => {
    mocks.organizationCount.mockResolvedValueOnce(0);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ requiresSetup: true });
  });

  it("returns setup disabled when organization exists", async () => {
    mocks.organizationCount.mockResolvedValueOnce(1);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ requiresSetup: false });
  });
});
