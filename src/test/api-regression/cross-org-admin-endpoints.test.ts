/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  listAccessReviewReports: vi.fn(),
  getAccessReviewReportForDownload: vi.fn(),
  getRetentionConfiguration: vi.fn(),
  updateRetentionConfiguration: vi.fn(),
  listLegalHolds: vi.fn(),
  createLegalHold: vi.fn(),
  releaseLegalHold: vi.fn(),
  listReleaseEntries: vi.fn(),
  updateReleaseEntry: vi.fn(),
  signReleaseEntry: vi.fn(),
  writeAuditEvent: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  fileToResponse: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/access-review/service", () => ({
  listAccessReviewReports: mocks.listAccessReviewReports,
  getAccessReviewReportForDownload: mocks.getAccessReviewReportForDownload
}));

vi.mock("@/server/retention/service", () => ({
  getRetentionConfiguration: mocks.getRetentionConfiguration,
  updateRetentionConfiguration: mocks.updateRetentionConfiguration,
  listLegalHolds: mocks.listLegalHolds,
  createLegalHold: mocks.createLegalHold,
  releaseLegalHold: mocks.releaseLegalHold
}));

vi.mock("@/server/releases/service", () => ({
  listReleaseEntries: mocks.listReleaseEntries,
  updateReleaseEntry: mocks.updateReleaseEntry,
  signReleaseEntry: mocks.signReleaseEntry
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    readFile: mocks.readFile
  },
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
  readFile: mocks.readFile
}));

vi.mock("@/server/export/packageExporter", () => ({
  fileToResponse: mocks.fileToResponse
}));

import { GET as accessReportsGet } from "@/app/api/admin/access-reviews/reports/route";
import { GET as accessReportDownloadGet } from "@/app/api/admin/access-reviews/reports/[reportId]/download/route";
import { GET as retentionConfigGet } from "@/app/api/admin/retention/config/route";
import { GET as legalHoldsGet } from "@/app/api/admin/retention/legal-holds/route";
import { POST as legalHoldReleasePost } from "@/app/api/admin/retention/legal-holds/[holdId]/release/route";
import { GET as releasesGet } from "@/app/api/admin/releases/route";
import { PATCH as releasePatch } from "@/app/api/admin/releases/[releaseId]/route";
import { POST as releaseSignPost } from "@/app/api/admin/releases/[releaseId]/sign/route";
import { GET as releaseExportGet } from "@/app/api/admin/releases/export/route";

describe("cross-org admin endpoint coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "admin_a",
      organizationId: "org_a",
      role: "ADMIN",
      email: "admin.a@test.local"
    });
    mocks.fileToResponse.mockResolvedValue(new Response("build_version\n1.0.0-a", { status: 200 }));
    mocks.readFile.mockResolvedValue(Buffer.from("csv,data"));
  });

  it("scopes admin list endpoints to caller organization", async () => {
    mocks.listAccessReviewReports.mockResolvedValue([{ id: "report_a" }]);
    mocks.getRetentionConfiguration.mockResolvedValue({ organizationId: "org_a" });
    mocks.listLegalHolds.mockResolvedValue([{ id: "hold_a" }]);
    mocks.listReleaseEntries.mockResolvedValue([
      {
        id: "rel-a",
        buildVersion: "1.0.0-a",
        releaseDate: new Date("2026-01-01T00:00:00.000Z"),
        changeSummary: "Org A release",
        riskImpact: "LOW",
        approvedSignatureId: null,
        approvedSignature: null,
        deployedAt: null
      }
    ]);

    const access = await accessReportsGet();
    const retention = await retentionConfigGet();
    const holds = await legalHoldsGet();
    const releases = await releasesGet();

    expect(access.status).toBe(200);
    expect(retention.status).toBe(200);
    expect(holds.status).toBe(200);
    expect(releases.status).toBe(200);

    expect(mocks.listAccessReviewReports).toHaveBeenCalledWith("org_a");
    expect(mocks.getRetentionConfiguration).toHaveBeenCalledWith("org_a");
    expect(mocks.listLegalHolds).toHaveBeenCalledWith("org_a");
    expect(mocks.listReleaseEntries).toHaveBeenCalledWith("org_a");
  });

  it("returns 404 for cross-org access review download", async () => {
    mocks.getAccessReviewReportForDownload.mockRejectedValueOnce(new ApiError(404, "Report not found."));
    const response = await accessReportDownloadGet(
      new Request("http://localhost/api/admin/access-reviews/reports/report_b/download"),
      { params: Promise.resolve({ reportId: "report_b" }) }
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for cross-org legal hold release", async () => {
    mocks.releaseLegalHold.mockRejectedValueOnce(new ApiError(404, "Legal hold not found."));
    const response = await legalHoldReleasePost(
      new Request("http://localhost/api/admin/retention/legal-holds/hold_b/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "cross-org attempt" })
      }),
      { params: Promise.resolve({ holdId: "hold_b" }) }
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for cross-org release update and signing", async () => {
    mocks.updateReleaseEntry.mockRejectedValueOnce(new ApiError(404, "Release not found."));
    mocks.signReleaseEntry.mockRejectedValueOnce(new ApiError(404, "Release not found."));

    const patchResponse = await releasePatch(
      new Request("http://localhost/api/admin/releases/release_b", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ change_summary: "cross-org" })
      }),
      { params: Promise.resolve({ releaseId: "release_b" }) }
    );
    const signResponse = await releaseSignPost(
      new Request("http://localhost/api/admin/releases/release_b/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "Password123!" })
      }),
      { params: Promise.resolve({ releaseId: "release_b" }) }
    );

    expect(patchResponse.status).toBe(404);
    expect(signResponse.status).toBe(404);
  });

  it("does not leak cross-org data in release export", async () => {
    mocks.listReleaseEntries.mockResolvedValue([
      {
        id: "rel-a",
        buildVersion: "1.0.0-a",
        releaseDate: new Date("2026-01-01T00:00:00.000Z"),
        changeSummary: "Org A release",
        riskImpact: "LOW",
        approvedSignatureId: null,
        approvedSignature: null,
        deployedAt: null
      }
    ]);

    const response = await releaseExportGet(new Request("http://localhost/api/admin/releases/export"));
    expect(response.status).toBe(200);
    expect(mocks.listReleaseEntries).toHaveBeenCalledWith("org_a");
    expect(mocks.fileToResponse).toHaveBeenCalled();
  });
});
