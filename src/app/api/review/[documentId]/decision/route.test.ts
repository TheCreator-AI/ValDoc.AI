import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  setReviewDecision: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/workflow/review", () => ({
  setReviewDecision: mocks.setReviewDecision
}));

import { QualityGateFailureError } from "@/server/quality/documentQualityGate";
import { POST } from "./route";

describe("POST /api/review/:documentId/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "REVIEWER"
    });
    mocks.setReviewDecision.mockResolvedValue({
      id: "doc-1",
      status: "APPROVED"
    });
  });

  it("returns 422 when quality gate fails", async () => {
    mocks.setReviewDecision.mockRejectedValueOnce(new QualityGateFailureError([{ code: "TRACE", message: "missing mappings" }]));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "APPROVED" })
      }),
      { params: Promise.resolve({ documentId: "doc-1" }) }
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toContain("Document Quality Gate failed");
    expect(body.issues).toEqual([{ code: "TRACE", message: "missing mappings" }]);
  });

  it("passes actor user id into review workflow", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "APPROVED" })
      }),
      { params: Promise.resolve({ documentId: "doc-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.setReviewDecision).toHaveBeenCalledWith({
      organizationId: "org1",
      documentId: "doc-1",
      decision: "APPROVED",
      actorUserId: "u1",
      request: expect.any(Request)
    });
  });
});
