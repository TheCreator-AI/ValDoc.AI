import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  verifyDocumentVersionIntegrity: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/integrity/verify", () => ({
  verifyDocumentVersionIntegrity: mocks.verifyDocumentVersionIntegrity
}));

import { GET } from "./route";

describe("GET /api/documents/:id/versions/:versionId/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "REVIEWER"
    });
  });

  it("returns hash verification results", async () => {
    mocks.verifyDocumentVersionIntegrity.mockResolvedValueOnce({
      versionId: "v1",
      documentId: "doc1",
      storedHash: "abc",
      computedHash: "abc",
      matches: true
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "doc1", versionId: "v1" })
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      versionId: "v1",
      documentId: "doc1",
      storedHash: "abc",
      computedHash: "abc",
      matches: true
    });
  });

  it("returns ApiError status codes", async () => {
    mocks.verifyDocumentVersionIntegrity.mockRejectedValueOnce(new ApiError(404, "Document version not found."));
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "doc1", versionId: "v1" })
    });
    expect(response.status).toBe(404);
  });
});
