import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  transitionDocumentVersionState: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/documents/lifecycle", () => ({
  transitionDocumentVersionState: mocks.transitionDocumentVersionState
}));

import { POST } from "./route";

describe("POST /api/documents/:id/versions/:versionId/transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "REVIEWER"
    });
    mocks.transitionDocumentVersionState.mockResolvedValue({ id: "v2", state: "IN_REVIEW" });
  });

  it("blocks direct draft to approved transition", async () => {
    mocks.transitionDocumentVersionState.mockRejectedValueOnce(
      new ApiError(409, "Invalid transition: DRAFT -> APPROVED.")
    );
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_state: "APPROVED" })
      }),
      { params: Promise.resolve({ id: "doc1", versionId: "v1" }) }
    );
    expect(response.status).toBe(409);
  });

  it("blocks obsolete transition without replacement or justification", async () => {
    mocks.transitionDocumentVersionState.mockRejectedValueOnce(
      new ApiError(400, "OBSOLETE requires replacement version reference or justification.")
    );
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_state: "OBSOLETE" })
      }),
      { params: Promise.resolve({ id: "doc1", versionId: "v2" }) }
    );
    expect(response.status).toBe(400);
  });

  it("transitions through allowed path and returns new state", async () => {
    mocks.transitionDocumentVersionState.mockResolvedValueOnce({ id: "v2", state: "IN_REVIEW" });
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_state: "IN_REVIEW" })
      }),
      { params: Promise.resolve({ id: "doc1", versionId: "v2" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.transitionDocumentVersionState).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org1",
        documentId: "doc1",
        versionId: "v2",
        actorUserId: "u1",
        actorRole: "REVIEWER",
        toState: "IN_REVIEW"
      })
    );
  });

  it("ignores client-supplied timestamp on transition requests", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_state: "IN_REVIEW",
          transitioned_at: "1999-01-01T00:00:00.000Z"
        })
      }),
      { params: Promise.resolve({ id: "doc1", versionId: "v2" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.transitionDocumentVersionState).toHaveBeenCalledWith(
      expect.not.objectContaining({
        transitionedAt: "1999-01-01T00:00:00.000Z"
      })
    );
  });
});
