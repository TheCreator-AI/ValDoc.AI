import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  exportEvidencePackage: vi.fn(),
  fileToResponse: vi.fn(),
  writeAuditEvent: vi.fn(),
  checkAndConsumeRateLimit: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/evidence/exporter", () => ({
  exportEvidencePackage: mocks.exportEvidencePackage
}));

vi.mock("@/server/export/packageExporter", () => ({
  fileToResponse: mocks.fileToResponse
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

vi.mock("@/server/security/rateLimit", () => ({
  checkAndConsumeRateLimit: mocks.checkAndConsumeRateLimit
}));

import { POST } from "./route";

describe("POST /api/admin/evidence/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fileToResponse.mockResolvedValue(new Response("ok"));
    mocks.writeAuditEvent.mockResolvedValue(undefined);
    mocks.checkAndConsumeRateLimit.mockReturnValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
  });

  it("enforces admin role", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await POST(new Request("http://localhost/api/admin/evidence/export"));
    expect(response.status).toBe(403);
  });

  it("exports package and returns zipped response", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN"
    });
    mocks.exportEvidencePackage.mockResolvedValue({
      filePath: "C:\\tmp\\evidence.zip",
      manifest: { generatedAt: "2026-02-19T00:00:00.000Z", artifacts: { "index.md": "abc" } }
    });

    const response = await POST(
      new Request("http://localhost/api/admin/evidence/export?date_from=2026-01-01&date_to=2026-01-31")
    );

    expect(response.status).toBe(200);
    expect(mocks.exportEvidencePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org1",
        actorUserId: "u1",
        dateFrom: new Date("2026-01-01T00:00:00.000Z"),
        dateTo: new Date("2026-01-31T23:59:59.999Z")
      })
    );
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "evidence.export",
        entityType: "EvidencePackage",
        outcome: "SUCCESS"
      })
    );
  });

  it("returns 429 when evidence export rate limit is exceeded", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN"
    });
    mocks.checkAndConsumeRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });

    const response = await POST(
      new Request("http://localhost/api/admin/evidence/export?date_from=2026-01-01&date_to=2026-01-31")
    );
    expect(response.status).toBe(429);
  });
});
