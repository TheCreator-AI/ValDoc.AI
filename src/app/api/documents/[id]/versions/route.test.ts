import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  createDocumentVersion: vi.fn(),
  listDocumentVersionHistory: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/documents/lifecycle", () => ({
  createDocumentVersion: mocks.createDocumentVersion,
  listDocumentVersionHistory: mocks.listDocumentVersionHistory
}));

import { GET, POST } from "./route";

describe("POST /api/documents/:id/versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ENGINEER"
    });
    mocks.createDocumentVersion.mockResolvedValue({ id: "v3", versionNumber: 3, state: "DRAFT" });
    mocks.listDocumentVersionHistory.mockResolvedValue([
      {
        id: "v3",
        versionNumber: 3,
        state: "DRAFT",
        changeReason: "Correction: fixed requirement statement",
        changeComment: "Correction",
        createdAt: "2026-02-19T00:00:00.000Z",
        editedBy: { id: "u1", fullName: "Andrew", email: "andrew@qa.org" },
        signatures: []
      }
    ]);
  });

  it("requires change_reason", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_json: "{\"a\":1}" })
      }),
      { params: Promise.resolve({ id: "doc1" }) }
    );
    expect(response.status).toBe(400);
  });

  it("creates a new version from latest", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_json: "{\"a\":1}", change_reason: "Address reviewer comments" })
      }),
      { params: Promise.resolve({ id: "doc1" }) }
    );
    expect(response.status).toBe(201);
    expect(mocks.createDocumentVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org1",
        documentId: "doc1",
        actorUserId: "u1",
        changeReason: "Address reviewer comments"
      })
    );
  });

  it("rejects immutable approved version edits", async () => {
    mocks.createDocumentVersion.mockRejectedValueOnce(
      new ApiError(409, "Approved versions are immutable. Create a successor draft version.")
    );
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_json: "{\"a\":1}", change_reason: "Fix typo" })
      }),
      { params: Promise.resolve({ id: "doc1" }) }
    );
    expect(response.status).toBe(409);
  });

  it("ignores client-supplied created_at on version creation", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_json: "{\"a\":1}",
          change_reason: "Fix typo",
          created_at: "1999-01-01T00:00:00.000Z"
        })
      }),
      { params: Promise.resolve({ id: "doc1" }) }
    );
    expect(response.status).toBe(201);
    expect(mocks.createDocumentVersion).toHaveBeenCalledWith(
      expect.not.objectContaining({
        createdAt: "1999-01-01T00:00:00.000Z"
      })
    );
  });
});


describe("GET /api/documents/:id/versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ENGINEER"
    });
    mocks.listDocumentVersionHistory.mockResolvedValue([
      {
        id: "v1",
        versionNumber: 1,
        state: "APPROVED",
        changeReason: "Initial approval",
        changeComment: "Baseline",
        createdAt: "2026-02-19T00:00:00.000Z",
        editedBy: { id: "u1", fullName: "Andrew", email: "andrew@qa.org" },
        signatures: [
          { id: "sig1", signerFullName: "Reviewer One", meaning: "APPROVE", signedAt: "2026-02-19T01:00:00.000Z" }
        ]
      }
    ]);
  });

  it("returns version history with change reasons and signatures", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "doc1" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[0].changeReason).toBe("Initial approval");
    expect(body[0].signatures[0].meaning).toBe("APPROVE");
  });
});
