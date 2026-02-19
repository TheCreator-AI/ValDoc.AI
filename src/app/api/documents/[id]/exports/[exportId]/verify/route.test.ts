import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  verifyDocumentExportIntegrity: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/integrity/verify", () => ({
  verifyDocumentExportIntegrity: mocks.verifyDocumentExportIntegrity
}));

import { GET } from "./route";

describe("GET /api/documents/:id/exports/:exportId/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "REVIEWER"
    });
  });

  it("returns export hash verification results", async () => {
    mocks.verifyDocumentExportIntegrity.mockResolvedValueOnce({
      exportId: "exp1",
      documentId: "doc1",
      storedHash: "abc",
      computedHash: "abc",
      matches: true,
      format: "pdf"
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "doc1", exportId: "exp1" })
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      exportId: "exp1",
      documentId: "doc1",
      storedHash: "abc",
      computedHash: "abc",
      matches: true,
      format: "pdf"
    });
  });

  it("returns ApiError status codes", async () => {
    mocks.verifyDocumentExportIntegrity.mockRejectedValueOnce(new ApiError(404, "Document export not found."));
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "doc1", exportId: "exp1" })
    });
    expect(response.status).toBe(404);
  });
});
