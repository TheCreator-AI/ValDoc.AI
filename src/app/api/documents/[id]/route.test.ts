import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  softDeleteRegulatedDocument: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/documents/lifecycle", () => ({
  softDeleteRegulatedDocument: mocks.softDeleteRegulatedDocument
}));

import { DELETE } from "./route";

describe("DELETE /api/documents/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ENGINEER"
    });
    mocks.softDeleteRegulatedDocument.mockResolvedValue({
      id: "doc1",
      deletedAt: "2026-02-19T00:00:00.000Z"
    });
  });

  it("requires delete reason", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/documents/doc1", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "" })
      }),
      { params: Promise.resolve({ id: "doc1" }) }
    );
    expect(response.status).toBe(400);
  });

  it("soft deletes regulated document with reason", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/documents/doc1", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Correction superseded by new controlled version" })
      }),
      { params: Promise.resolve({ id: "doc1" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.softDeleteRegulatedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org1",
        documentId: "doc1",
        actorUserId: "u1",
        reason: "Correction superseded by new controlled version"
      })
    );
  });

  it("returns lifecycle errors", async () => {
    mocks.softDeleteRegulatedDocument.mockRejectedValueOnce(new ApiError(404, "Document not found."));
    const response = await DELETE(
      new Request("http://localhost/api/documents/doc1", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "No longer applicable" })
      }),
      { params: Promise.resolve({ id: "doc1" }) }
    );
    expect(response.status).toBe(404);
  });
});
