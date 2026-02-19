import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  findUrsDocument: vi.fn(),
  findUser: vi.fn(),
  findExistingRa: vi.fn(),
  createGeneratedDocument: vi.fn(),
  updateGeneratedDocument: vi.fn(),
  findLastVersion: vi.fn(),
  createDocumentVersion: vi.fn(),
  createAuditEvent: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    generatedDocument: {
      findFirst: mocks.findUrsDocument,
      create: mocks.createGeneratedDocument,
      update: mocks.updateGeneratedDocument
    },
    user: { findUnique: mocks.findUser },
    documentVersion: { findFirst: mocks.findLastVersion, create: mocks.createDocumentVersion },
    auditEvent: { create: mocks.createAuditEvent }
  }
}));

import { POST } from "./route";
import { ApiError } from "@/server/api/http";

describe("POST /api/urs/:id/generate/ra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.findUser.mockResolvedValue({ id: "u1", email: "andrew@qa.org" });
    mocks.findLastVersion.mockResolvedValue(null);
    mocks.createGeneratedDocument.mockResolvedValue({ id: "ra-doc-1" });
    mocks.createDocumentVersion.mockResolvedValue({ id: "ver-1" });
    mocks.createAuditEvent.mockResolvedValue({ id: "audit-1" });
  });

  it("rejects unauthorized caller", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "urs-doc-1" })
    });

    expect(response.status).toBe(403);
  });

  it("generates and persists RA with version hash", async () => {
    mocks.findUrsDocument
      .mockResolvedValueOnce({
        id: "urs-doc-1",
        docType: "URS",
        organizationId: "org1",
        title: "Equipment URS",
        currentContent:
          "| Req ID | Category | Statement | Acceptance Criteria | Test Method | Criticality | Linked Risks | Linked Tests |\n|---|---|---|---|---|---|---|---|\n| URS-001 | Data Integrity | The system shall enforce unique credentials. | Unique credentials exist. | Doc Review | HIGH | RA-001 | TC-001 |",
        generationJobId: "job1",
        generationJob: { machine: { name: "TSX", modelNumber: "TSX2320FA20" } }
      })
      .mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "urs-doc-1" })
    });

    expect(response.status).toBe(201);
    expect(mocks.createGeneratedDocument).toHaveBeenCalled();
    expect(mocks.createDocumentVersion).toHaveBeenCalled();
    const createArgs = mocks.createDocumentVersion.mock.calls[0][0];
    expect(createArgs.data.contentHash).toBeTypeOf("string");
  });
});
