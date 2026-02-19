import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  runRetentionPurge: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/retention/service", () => ({
  runRetentionPurge: mocks.runRetentionPurge
}));

import { POST } from "./route";

describe("admin retention purge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "admin-1",
      organizationId: "org-1",
      role: "ADMIN"
    });
  });

  it("runs dry-run purge by default", async () => {
    mocks.runRetentionPurge.mockResolvedValue({
      runId: "run-1",
      dryRun: true,
      reportHash: "hash-1",
      reportPath: "storage/retention-reports/run-1.json",
      summary: { deletedDocuments: 0, deletedVersions: 0, deletedAuditEvents: 0 }
    });

    const response = await POST(new Request("http://localhost/api/admin/retention/purge", { method: "POST" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.dryRun).toBe(true);
    expect(mocks.runRetentionPurge).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true
      })
    );
  });

  it("runs apply purge when requested", async () => {
    mocks.runRetentionPurge.mockResolvedValue({
      runId: "run-2",
      dryRun: false,
      reportHash: "hash-2",
      reportPath: "storage/retention-reports/run-2.json",
      summary: { deletedDocuments: 2, deletedVersions: 3, deletedAuditEvents: 0 }
    });

    const response = await POST(
      new Request("http://localhost/api/admin/retention/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false })
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.dryRun).toBe(false);
  });

  it("enforces authorization", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await POST(new Request("http://localhost/api/admin/retention/purge", { method: "POST" }));
    expect(response.status).toBe(403);
  });
});
