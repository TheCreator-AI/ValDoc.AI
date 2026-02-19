import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  unitFindFirst: vi.fn(),
  createExecutedDocument: vi.fn(),
  findManyExecutedDocument: vi.fn(),
  saveUploadedFile: vi.fn(),
  writeAuditEvent: vi.fn()
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
    unit: { findFirst: mocks.unitFindFirst },
    unitExecutedDocument: {
      create: mocks.createExecutedDocument,
      findMany: mocks.findManyExecutedDocument
    }
  }
}));

vi.mock("@/server/files/storage", () => ({
  saveUploadedFile: mocks.saveUploadedFile
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { POST } from "./route";

describe("POST /api/units/:unitId/executed-documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.unitFindFirst.mockResolvedValue({ id: "unit1", organizationId: "org1" });
    mocks.saveUploadedFile.mockResolvedValue({
      fileName: "exec.pdf",
      filePath: "C:\\storage\\uploads\\uuid.pdf",
      mimeType: "application/pdf"
    });
    mocks.createExecutedDocument.mockResolvedValue({
      id: "ed1",
      title: "Executed IOQ",
      documentType: "EXECUTED_PROTOCOL"
    });
  });

  it("records audit event on executed upload", async () => {
    const form = new FormData();
    form.set("file", new File([Buffer.from("%PDF-1.7")], "exec.pdf", { type: "application/pdf" }));
    form.set("title", "Executed IOQ");
    form.set("documentType", "EXECUTED_PROTOCOL");

    const request = { formData: async () => form } as unknown as Request;
    const response = await POST(request, {
      params: Promise.resolve({ unitId: "unit1" })
    });

    expect(response.status).toBe(201);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.upload.executed",
        entityId: "ed1"
      })
    );
  });

  it("returns 413 when storage rejects oversized file", async () => {
    mocks.saveUploadedFile.mockRejectedValueOnce(new ApiError(413, "File too large."));
    const form = new FormData();
    form.set("file", new File([Buffer.from("%PDF-1.7")], "exec.pdf", { type: "application/pdf" }));

    const request = { formData: async () => form } as unknown as Request;
    const response = await POST(request, {
      params: Promise.resolve({ unitId: "unit1" })
    });
    expect(response.status).toBe(413);
  });
});
