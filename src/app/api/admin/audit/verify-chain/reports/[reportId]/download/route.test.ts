import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  getTamperEvidenceReportForDownload: vi.fn(),
  ensureStoragePathIsSafe: vi.fn(),
  readFile: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrowWithPermission: mocks.getSessionOrThrowWithPermission
  };
});

vi.mock("@/server/audit/verificationReport", () => ({
  getTamperEvidenceReportForDownload: mocks.getTamperEvidenceReportForDownload
}));

vi.mock("@/server/files/storage", () => ({
  ensureStoragePathIsSafe: mocks.ensureStoragePathIsSafe
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: mocks.readFile
  },
  readFile: mocks.readFile
}));

import { GET } from "./route";

describe("GET /api/admin/audit/verify-chain/reports/:id/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrowWithPermission.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN"
    });
    mocks.getTamperEvidenceReportForDownload.mockResolvedValue({
      id: "avr1",
      reportPath: "storage/audit-verification-reports/avr1.json"
    });
    mocks.readFile.mockResolvedValue(Buffer.from("{\"ok\":true}"));
  });

  it("downloads report with nosniff header", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/audit/verify-chain/reports/avr1/download"),
      { params: Promise.resolve({ reportId: "avr1" }) }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mocks.getTamperEvidenceReportForDownload).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org1", reportId: "avr1" })
    );
  });

  it("returns auth error when permission check fails", async () => {
    mocks.getSessionOrThrowWithPermission.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await GET(
      new Request("http://localhost/api/admin/audit/verify-chain/reports/avr1/download"),
      { params: Promise.resolve({ reportId: "avr1" }) }
    );
    expect(response.status).toBe(403);
  });
});
