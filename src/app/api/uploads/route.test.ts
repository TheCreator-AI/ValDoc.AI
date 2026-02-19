import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  ingestUpload: vi.fn(),
  writeAuditEvent: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/generation/uploadIngest", () => ({
  ingestUpload: mocks.ingestUpload
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { POST } from "./route";

describe("POST /api/uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ENGINEER"
    });
    mocks.ingestUpload.mockResolvedValue({ sourceId: "s1", chunksIndexed: 1, factModel: {} });
  });

  const buildRequest = (file: File) => {
    const form = new FormData();
    form.set("machineId", "m1");
    form.set("sourceType", "MANUAL");
    form.set("file", file);
    return { formData: async () => form } as unknown as Request;
  };

  it("returns 400 for unsupported file type errors", async () => {
    mocks.ingestUpload.mockRejectedValueOnce(new ApiError(400, "Unsupported file type."));
    const response = await POST(buildRequest(new File([Buffer.from([1, 2, 3])], "bad.exe", { type: "application/octet-stream" })));
    expect(response.status).toBe(400);
  });

  it("returns 413 for oversized upload errors", async () => {
    mocks.ingestUpload.mockRejectedValueOnce(new ApiError(413, "File too large."));
    const response = await POST(buildRequest(new File([Buffer.from("%PDF-1.7")], "big.pdf", { type: "application/pdf" })));
    expect(response.status).toBe(413);
  });

  it("rejects unauthorized callers", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(401, "Authentication required."));
    const response = await POST(buildRequest(new File([Buffer.from("%PDF-1.7")], "a.pdf", { type: "application/pdf" })));
    expect(response.status).toBe(401);
  });

  it("writes audit event after successful upload ingestion", async () => {
    const response = await POST(buildRequest(new File([Buffer.from("%PDF-1.7")], "manual.pdf", { type: "application/pdf" })));
    expect(response.status).toBe(200);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.upload.source",
        entityType: "SourceDocument",
        entityId: "s1"
      })
    );
  });
});
