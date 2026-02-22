import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  searchChunks: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrowWithPermission: mocks.getSessionOrThrowWithPermission
  };
});

vi.mock("@/server/search/indexer", () => ({
  searchChunks: mocks.searchChunks
}));

import { GET } from "./route";

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrowWithPermission.mockResolvedValue({
      userId: "u1",
      organizationId: "org_a",
      role: "ADMIN",
      email: "admin@a.test"
    });
    mocks.searchChunks.mockResolvedValue([
      {
        id: "chunk_1",
        organizationId: "org_a",
        chunkText: "alarm setpoint",
        sectionLabel: "Section 2",
        pageNumber: 12
      }
    ]);
  });

  it("requires a query", async () => {
    const response = await GET(new Request("http://localhost/api/search"));
    expect(response.status).toBe(400);
  });

  it("uses org-scoped search", async () => {
    const response = await GET(new Request("http://localhost/api/search?q=alarm"));
    expect(response.status).toBe(200);
    expect(mocks.searchChunks).toHaveBeenCalledWith("org_a", "alarm");
  });
});
