import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  findMachine: vi.fn(),
  findUser: vi.fn(),
  listFacts: vi.fn(),
  findGeneratedDocument: vi.fn(),
  findLatestJob: vi.fn(),
  createJob: vi.fn(),
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
    machine: { findFirst: mocks.findMachine },
    user: { findUnique: mocks.findUser },
    equipmentFact: { findMany: mocks.listFacts },
    generationJob: { findFirst: mocks.findLatestJob, create: mocks.createJob },
    generatedDocument: {
      findFirst: mocks.findGeneratedDocument,
      create: mocks.createGeneratedDocument,
      update: mocks.updateGeneratedDocument
    },
    documentVersion: { findFirst: mocks.findLastVersion, create: mocks.createDocumentVersion },
    auditEvent: { create: mocks.createAuditEvent }
  }
}));

import { POST } from "./route";
import { ApiError } from "@/server/api/http";

describe("POST /api/equipment/:id/generate/ioq", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.findMachine.mockResolvedValue({
      id: "machine-1",
      name: "TSX Freezer",
      modelNumber: "TSX2320FA20",
      organizationId: "org1"
    });
    mocks.findUser.mockResolvedValue({ id: "u1", email: "andrew@qa.org" });
    mocks.listFacts.mockResolvedValue([{ key: "line_voltage", value: "120 +/- 10%", units: "V" }]);
    mocks.findGeneratedDocument
      .mockResolvedValueOnce({
        id: "urs-1",
        docType: "URS",
        currentContent: JSON.stringify({
          requirements: [
            {
              req_id: "URS-001",
              category: "Utilities",
              statement: "System shall support 120V +/-10%.",
              acceptance_criteria: "Voltage requirement met.",
              linked_risk_ids: ["RA-001"]
            }
          ]
        })
      })
      .mockResolvedValueOnce(null);
    mocks.findLatestJob.mockResolvedValue({ id: "job-1" });
    mocks.createGeneratedDocument.mockResolvedValue({ id: "ioq-1" });
    mocks.findLastVersion.mockResolvedValue(null);
    mocks.createDocumentVersion.mockResolvedValue({ id: "ver-1" });
    mocks.createAuditEvent.mockResolvedValue({ id: "audit-1" });
  });

  it("rejects unauthorized caller", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "machine-1" })
    });

    expect(response.status).toBe(403);
  });

  it("generates IOQ and persists version hash", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "machine-1" })
    });

    expect(response.status).toBe(201);
    expect(mocks.createGeneratedDocument).toHaveBeenCalled();
    expect(mocks.createDocumentVersion).toHaveBeenCalled();
    const createArgs = mocks.createDocumentVersion.mock.calls[0][0];
    expect(createArgs.data.contentHash).toBeTypeOf("string");
  });
});
