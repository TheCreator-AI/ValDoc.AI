import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  executedFindFirst: vi.fn(),
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
    unitExecutedDocument: {
      findFirst: mocks.executedFindFirst
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

describe("GET /api/units/:unitId/executed-documents/:documentId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.executedFindFirst.mockResolvedValue({
      id: "ed1",
      title: "Executed IOQ",
      documentType: "EXECUTED_PROTOCOL",
      filePath: "C:\\storage\\uploads\\ed1.pdf",
      mimeType: "application/pdf"
    });
    mocks.fileToResponse.mockResolvedValue(new Response("ok", { status: 200 }));
  });

  it("records audit on executed document download", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ unitId: "unit1", documentId: "ed1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.download.executed",
        entityId: "ed1"
      })
    );
  });

  it("returns unauthorized when session missing", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(401, "Authentication required."));
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ unitId: "unit1", documentId: "ed1" })
    });
    expect(response.status).toBe(401);
  });

  it("logs denied download when executed document is not accessible", async () => {
    mocks.executedFindFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ unitId: "unit1", documentId: "missing" })
    });

    expect(response.status).toBe(404);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.download.executed.denied",
        outcome: "DENIED",
        entityId: "missing"
      })
    );
  });
});
