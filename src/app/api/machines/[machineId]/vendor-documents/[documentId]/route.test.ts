import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  vendorFindFirst: vi.fn(),
  fileToResponse: vi.fn(),
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
    machineVendorDocument: {
      findFirst: mocks.vendorFindFirst
    }
  }
}));

vi.mock("@/server/export/packageExporter", () => ({
  fileToResponse: mocks.fileToResponse
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { GET } from "./route";

describe("GET /api/machines/:machineId/vendor-documents/:documentId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.vendorFindFirst.mockResolvedValue({
      id: "vd1",
      title: "Vendor IOQ",
      documentType: "VENDOR_IOQ",
      filePath: "C:\\storage\\uploads\\uuid.pdf",
      mimeType: "application/pdf"
    });
    mocks.fileToResponse.mockResolvedValue(new Response("ok", { status: 200 }));
  });

  it("records audit on vendor download", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ machineId: "m1", documentId: "vd1" })
    });
    expect(response.status).toBe(200);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.download.vendor",
        entityId: "vd1"
      })
    );
  });

  it("denies unauthorized caller", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(401, "Authentication required."));
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ machineId: "m1", documentId: "vd1" })
    });
    expect(response.status).toBe(401);
  });

  it("logs denied download when vendor document is not accessible", async () => {
    mocks.vendorFindFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ machineId: "m1", documentId: "missing" })
    });

    expect(response.status).toBe(404);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.download.vendor.denied",
        outcome: "DENIED",
        entityId: "missing"
      })
    );
  });
});
