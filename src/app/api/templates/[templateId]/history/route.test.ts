import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  templateFindFirst: vi.fn(),
  templateFindMany: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrowWithPermission: mocks.getSessionOrThrowWithPermission
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    documentTemplate: {
      findFirst: mocks.templateFindFirst,
      findMany: mocks.templateFindMany
    }
  }
}));

import { GET } from "./route";

describe("GET /api/templates/:templateId/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns version history for a template family", async () => {
    mocks.getSessionOrThrowWithPermission.mockResolvedValueOnce({
      userId: "u1",
      organizationId: "org1",
      role: "AUTHOR"
    });
    mocks.templateFindFirst.mockResolvedValueOnce({ id: "v3", templateId: "tmpl-1" });
    mocks.templateFindMany.mockResolvedValueOnce([
      { id: "v3", templateId: "tmpl-1", version: 3, status: "APPROVED" },
      { id: "v2", templateId: "tmpl-1", version: 2, status: "DRAFT" }
    ]);

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ templateId: "v3" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.templateId).toBe("tmpl-1");
    expect(body.versions).toHaveLength(2);
  });

  it("enforces template read permission", async () => {
    mocks.getSessionOrThrowWithPermission.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ templateId: "v3" }) });
    expect(response.status).toBe(403);
  });
});
