import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  templateFindFirst: vi.fn(),
  stat: vi.fn(),
  createReadStream: vi.fn(),
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
    documentTemplate: {
      findFirst: mocks.templateFindFirst
    }
  }
}));

vi.mock("node:fs", () => ({
  default: {
    promises: { stat: mocks.stat },
    createReadStream: mocks.createReadStream
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { Readable } from "node:stream";
import { GET } from "./route";

describe("GET /api/templates/:templateId/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes audit event when template file is downloaded", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ENGINEER"
    });
    mocks.templateFindFirst.mockResolvedValue({
      id: "t1",
      organizationId: "org1",
      sourceFilePath: "C:\\Users\\Andrew Herman\\Val.AI\\valdoc-ai\\storage\\uploads\\template.docx",
      sourceMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sourceFileName: "template.docx"
    });
    mocks.stat.mockResolvedValue({ size: 12 });
    mocks.createReadStream.mockReturnValue(Readable.from(["hello world"]));

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ templateId: "t1" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "template.download",
        entityId: "t1"
      })
    );
  });

  it("rejects unauthorized callers", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ templateId: "t1" }) });
    expect(response.status).toBe(403);
  });

  it("logs denied download when template is not found", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ENGINEER"
    });
    mocks.templateFindFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ templateId: "missing" }) });

    expect(response.status).toBe(404);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "template.download.denied",
        outcome: "DENIED",
        entityId: "missing"
      })
    );
  });
});
