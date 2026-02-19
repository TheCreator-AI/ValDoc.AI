import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  machineFindFirst: vi.fn(),
  createVendorDocument: vi.fn(),
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
    machine: { findFirst: mocks.machineFindFirst },
    machineVendorDocument: {
      create: mocks.createVendorDocument,
      findMany: vi.fn()
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

describe("POST /api/machines/:machineId/vendor-documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.machineFindFirst.mockResolvedValue({ id: "m1", organizationId: "org1" });
    mocks.saveUploadedFile.mockResolvedValue({
      fileName: "vendor.pdf",
      filePath: "C:\\storage\\uploads\\uuid.pdf",
      mimeType: "application/pdf"
    });
    mocks.createVendorDocument.mockResolvedValue({
      id: "vd1",
      title: "Vendor Manual",
      documentType: "VENDOR_REFERENCE"
    });
  });

  it("records audit event on vendor upload", async () => {
    const form = new FormData();
    form.set("file", new File([Buffer.from("%PDF-1.7")], "vendor.pdf", { type: "application/pdf" }));
    form.set("title", "Vendor Manual");
    const request = { formData: async () => form } as unknown as Request;
    const response = await POST(request, {
      params: Promise.resolve({ machineId: "m1" })
    });

    expect(response.status).toBe(201);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.upload.vendor",
        entityType: "MachineVendorDocument",
        entityId: "vd1"
      })
    );
  });
});
