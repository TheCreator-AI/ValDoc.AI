import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  saveDocumentVersion: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/workflow/review", () => ({
  saveDocumentVersion: mocks.saveDocumentVersion
}));

import { POST } from "./route";

describe("POST /api/review/:documentId/version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ENGINEER"
    });
    mocks.saveDocumentVersion.mockResolvedValue({ id: "doc1", status: "IN_REVIEW" });
  });

  it("returns 409 when approved record is immutable", async () => {
    mocks.saveDocumentVersion.mockRejectedValueOnce(
      new ApiError(409, "Approved records are immutable. Create a new controlled record version.")
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "{\"x\":1}" })
      }),
      { params: Promise.resolve({ documentId: "doc1" }) }
    );

    expect(response.status).toBe(409);
  });

  it("saves draft/in-review content version", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "{\"x\":1}" })
      }),
      { params: Promise.resolve({ documentId: "doc1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.saveDocumentVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc1",
        updatedContent: "{\"x\":1}"
      })
    );
  });
});

