import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  chainHeadFindUnique: vi.fn(),
  reportCreate: vi.fn(),
  reportFindFirst: vi.fn(),
  writeAuditEvent: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    auditEvent: {
      findMany: mocks.auditFindMany
    },
    auditChainHead: {
      findUnique: mocks.chainHeadFindUnique
    },
    auditVerificationReport: {
      create: mocks.reportCreate,
      findFirst: mocks.reportFindFirst
    }
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

vi.mock("@/server/config/env", () => ({
  getRequiredEnv: () => ({
    JWT_SECRET: "test-secret",
    DATABASE_URL: "file:./dev.db",
    CUSTOMER_ID: "cust",
    ORG_NAME: "Org"
  })
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile
  },
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile
}));

import { generateTamperEvidenceReport, getTamperEvidenceReportForDownload } from "@/server/audit/verificationReport";

describe("audit verification report service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditFindMany.mockResolvedValue([
      {
        id: "e1",
        prevHash: "",
        eventHash: "h1",
        organizationId: "org1",
        actorUserId: "u1",
        action: "a1",
        entityType: "t1",
        entityId: "x1",
        outcome: "SUCCESS",
        metadataJson: null,
        detailsJson: null,
        ip: null,
        userAgent: null,
        timestamp: new Date("2026-02-20T00:00:00.000Z")
      }
    ]);
    mocks.chainHeadFindUnique.mockResolvedValue({ headHash: "h1" });
    mocks.reportCreate.mockResolvedValue({
      id: "avr1",
      reportHash: "hash1",
      signature: "sig1",
      pass: true,
      checkedEvents: 1,
      reportPath: "storage/audit-verification-reports/avr1.json"
    });
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.writeAuditEvent.mockResolvedValue(undefined);
  });

  it("creates signed tamper-evidence report and writes audit event", async () => {
    const result = await generateTamperEvidenceReport({
      organizationId: "org1",
      actorUserId: "u1"
    });
    expect(result.reportId).toBe("avr1");
    expect(mocks.reportCreate).toHaveBeenCalledTimes(1);
    expect(mocks.reportCreate.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org1",
          actorUserId: "u1",
          reportHash: expect.any(String),
          signature: expect.any(String),
          reportJson: expect.any(String)
        })
      })
    );
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "audit.verify_chain.report.generate",
        entityType: "AuditVerificationReport",
        entityId: "avr1"
      })
    );
  });

  it("loads report for authorized download and writes audit event", async () => {
    mocks.reportFindFirst.mockResolvedValueOnce({
      id: "avr1",
      organizationId: "org1",
      reportHash: "hash1",
      reportPath: "storage/audit-verification-reports/avr1.json"
    });
    const report = await getTamperEvidenceReportForDownload({
      organizationId: "org1",
      actorUserId: "u1",
      reportId: "avr1"
    });
    expect(report.id).toBe("avr1");
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "audit.verify_chain.report.download",
        entityType: "AuditVerificationReport",
        entityId: "avr1"
      })
    );
  });
});
