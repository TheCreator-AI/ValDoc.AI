import { describe, expect, it, vi } from "vitest";
import {
  buildAccessReviewReportCsv,
  buildAccessReviewReportPayload,
  createAccessReviewAttestationRecord
} from "@/server/access-review/service";

describe("access review reporting service", () => {
  it("builds accurate payload and csv from user records", () => {
    const payload = buildAccessReviewReportPayload({
      organization: { id: "org1", name: "Amnion" },
      generatedBy: "admin@amnion.com",
      users: [
        {
          id: "u1",
          email: "qa1@amnion.com",
          fullName: "QA One",
          role: "ADMIN",
          status: "ACTIVE",
          mfaEnabled: true,
          lastLoginAt: new Date("2026-02-19T10:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z")
        },
        {
          id: "u2",
          email: "qa2@amnion.com",
          fullName: "QA Two",
          role: "USER",
          status: "LOCKED",
          mfaEnabled: false,
          lastLoginAt: null,
          createdAt: new Date("2026-01-05T00:00:00.000Z")
        }
      ],
      generatedAt: new Date("2026-02-20T00:00:00.000Z")
    });

    expect(payload.users).toHaveLength(2);
    expect(payload.users[0]?.status).toBe("ACTIVE");
    expect(payload.users[1]?.status).toBe("LOCKED");
    expect(payload.users[0]?.mfaEnabled).toBe(true);
    expect(payload.users[1]?.lastLogin).toBeNull();

    const csv = buildAccessReviewReportCsv(payload);
    expect(csv).toContain("users,roles,status,last_login,mfa_enabled,created_at");
    expect(csv).toContain("qa1@amnion.com,ADMIN,ACTIVE");
    expect(csv).toContain("qa2@amnion.com,USER,LOCKED");
  });

  it("attestation record links signature manifest to report hash", async () => {
    const createSignature = vi.fn().mockResolvedValue({ id: "sig1" });
    const updateReport = vi.fn().mockResolvedValue({ id: "rep1" });

    const result = await createAccessReviewAttestationRecord({
      tx: {
        electronicSignature: { create: createSignature },
        accessReviewReport: { update: updateReport }
      } as never,
      organizationId: "org1",
      actor: { userId: "u1", fullName: "Admin" },
      report: { id: "rep1", reportHash: "hash-123" },
      remarks: "Quarterly review"
    });

    expect(result.id).toBe("sig1");
    expect(createSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signatureManifest: "hash-123",
          recordType: "ACCESS_REVIEW_REPORT",
          recordId: "rep1"
        })
      })
    );
    expect(updateReport).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attestedSignatureId: "sig1",
          attestedAt: expect.any(Date)
        })
      })
    );
  });
});

