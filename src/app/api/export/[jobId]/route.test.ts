import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  exportJobAsZip: vi.fn(),
  exportDocumentAsPdfWithMetadata: vi.fn(),
  exportDocumentAsDocxWithMetadata: vi.fn(),
  fileToResponse: vi.fn(),
  writeAuditEvent: vi.fn(),
  generatedDocumentFindMany: vi.fn(),
  traceabilityFindMany: vi.fn(),
  evaluateDocumentQualityGate: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrowWithPermission: mocks.getSessionOrThrowWithPermission
  };
});

vi.mock("@/server/export/packageExporter", () => ({
  exportJobAsZip: mocks.exportJobAsZip,
  exportDocumentAsPdfWithMetadata: mocks.exportDocumentAsPdfWithMetadata,
  exportDocumentAsDocxWithMetadata: mocks.exportDocumentAsDocxWithMetadata,
  fileToResponse: mocks.fileToResponse
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    generatedDocument: { findMany: mocks.generatedDocumentFindMany },
    traceabilityLink: { findMany: mocks.traceabilityFindMany }
  }
}));

vi.mock("@/server/quality/documentQualityGate", () => ({
  evaluateDocumentQualityGate: mocks.evaluateDocumentQualityGate
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { GET } from "./route";

describe("GET /api/export/:jobId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrowWithPermission.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ENGINEER"
    });
    mocks.fileToResponse.mockResolvedValue(new Response("ok", { status: 200 }));
    mocks.generatedDocumentFindMany.mockResolvedValue([
      { id: "d1", docType: "URS", currentContent: "{}" }
    ]);
    mocks.traceabilityFindMany.mockResolvedValue([]);
    mocks.evaluateDocumentQualityGate.mockReturnValue({ ready: true, issues: [] });
  });

  it("writes audit event for zip export", async () => {
    mocks.exportJobAsZip.mockResolvedValue("C:\\tmp\\job.zip");

    const response = await GET(new Request("http://localhost/api/export/j1?format=zip"), {
      params: Promise.resolve({ jobId: "j1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.getSessionOrThrowWithPermission).toHaveBeenCalledWith(expect.any(Request), "documents.export");
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.export.zip", entityType: "GenerationJob", entityId: "j1" })
    );
  });

  it("writes audit event for pdf export", async () => {
    mocks.exportDocumentAsPdfWithMetadata.mockResolvedValue({
      filePath: "C:\\tmp\\doc.pdf",
      title: "Summary"
    });

    const response = await GET(new Request("http://localhost/api/export/j1?format=pdf&documentId=d1"), {
      params: Promise.resolve({ jobId: "j1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.export.pdf", entityType: "GeneratedDocument", entityId: "d1" })
    );
  });

  it("blocks docx export when quality gate fails", async () => {
    mocks.evaluateDocumentQualityGate.mockReturnValueOnce({
      ready: false,
      issues: [{ code: "URS_REQ_ID_MISSING", message: "Missing req_id" }]
    });

    const response = await GET(new Request("http://localhost/api/export/j1?format=docx&documentId=d1"), {
      params: Promise.resolve({ jobId: "j1" })
    });

    expect(response.status).toBe(422);
  });

  it("returns generic not found on foreign or unknown export identifiers", async () => {
    mocks.exportDocumentAsPdfWithMetadata.mockRejectedValueOnce(new ApiError(404, "Document not found."));

    const response = await GET(new Request("http://localhost/api/export/guessable-id?format=pdf&documentId=foreign"), {
      params: Promise.resolve({ jobId: "guessable-id" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Export target not found." });
  });
});
