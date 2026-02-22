import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateTamperEvidenceReport: vi.fn()
}));

vi.mock("@/server/audit/verificationReport", () => ({
  generateTamperEvidenceReport: mocks.generateTamperEvidenceReport
}));

import { runScheduledAuditChainVerification } from "@/server/audit/scheduler";

describe("runScheduledAuditChainVerification", () => {
  it("generates a bounded verification report for the lookback window", async () => {
    mocks.generateTamperEvidenceReport.mockResolvedValueOnce({
      reportId: "rep1",
      pass: true
    });

    const result = await runScheduledAuditChainVerification({
      organizationId: "org_1",
      actorUserId: "admin_1",
      lookbackDays: 7
    });

    expect(result).toEqual({ reportId: "rep1", pass: true });
    expect(mocks.generateTamperEvidenceReport).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        actorUserId: "admin_1",
        dateFrom: expect.any(String),
        dateTo: expect.any(String)
      })
    );
  });
});
