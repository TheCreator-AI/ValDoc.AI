import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  releaseFindFirst: vi.fn(),
  releaseCreate: vi.fn(),
  releaseUpdate: vi.fn(),
  releaseFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  signatureCreate: vi.fn(),
  transaction: vi.fn(),
  writeAuditEvent: vi.fn(),
  compare: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    appRelease: {
      findFirst: mocks.releaseFindFirst,
      create: mocks.releaseCreate,
      update: mocks.releaseUpdate,
      findMany: mocks.releaseFindMany
    },
    user: {
      findFirst: mocks.userFindFirst
    },
    electronicSignature: {
      create: mocks.signatureCreate
    },
    $transaction: mocks.transaction
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

vi.mock("bcryptjs", () => ({
  compare: mocks.compare
}));

import { createReleaseEntry, signReleaseEntry, updateReleaseEntry } from "@/server/releases/service";

describe("release service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeAuditEvent.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        electronicSignature: { create: mocks.signatureCreate },
        appRelease: { update: mocks.releaseUpdate }
      };
      return await callback(tx);
    });
  });

  it("blocks updates to signed release entries", async () => {
    mocks.releaseFindFirst.mockResolvedValueOnce({
      id: "rel1",
      approvedSignatureId: "sig1"
    });

    await expect(
      updateReleaseEntry({
        organizationId: "org1",
        releaseId: "rel1",
        actorUserId: "u1",
        patch: { changeSummary: "new" }
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("creates signature and links it to release approval", async () => {
    mocks.releaseFindFirst.mockResolvedValue({
      id: "rel1",
      buildVersion: "1.2.3",
      releaseDate: new Date("2026-02-19T00:00:00.000Z"),
      changeSummary: "summary",
      riskImpact: "LOW",
      deployedAt: null,
      approvedSignatureId: null
    });
    mocks.userFindFirst.mockResolvedValue({
      id: "u1",
      fullName: "Admin User",
      passwordHash: "hash"
    });
    mocks.compare.mockResolvedValue(true);
    mocks.signatureCreate.mockResolvedValue({ id: "sig1" });
    mocks.releaseUpdate.mockResolvedValue({ id: "rel1", approvedSignatureId: "sig1" });

    const result = await signReleaseEntry({
      organizationId: "org1",
      releaseId: "rel1",
      actorUserId: "u1",
      password: "secret",
      remarks: "approved"
    });

    expect(result.approvedSignatureId).toBe("sig1");
    expect(mocks.signatureCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recordType: "APP_RELEASE",
          recordId: "rel1",
          recordVersionId: "rel1"
        })
      })
    );
  });

  it("creates release entry", async () => {
    mocks.releaseCreate.mockResolvedValue({ id: "rel1", buildVersion: "1.0.0" });
    const created = await createReleaseEntry({
      organizationId: "org1",
      actorUserId: "u1",
      payload: {
        buildVersion: "1.0.0",
        releaseDate: new Date("2026-02-19T00:00:00.000Z"),
        changeSummary: "initial",
        riskImpact: "MEDIUM",
        buildHash: "sha256-build",
        sbomHash: "sha256-sbom",
        testResultsSummaryHash: "sha256-tests",
        productionDeployRequested: false,
        deployedAt: null
      }
    });
    expect(created.buildVersion).toBe("1.0.0");
    expect(mocks.releaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildHash: "sha256-build",
          sbomHash: "sha256-sbom",
          testResultsSummaryHash: "sha256-tests",
          productionDeployRequested: false
        })
      })
    );
  });

  it("blocks creating release with production deploy requested before approval", async () => {
    await expect(
      createReleaseEntry({
        organizationId: "org1",
        actorUserId: "u1",
        payload: {
          buildVersion: "1.0.1",
          releaseDate: new Date("2026-02-19T00:00:00.000Z"),
          changeSummary: "initial",
          riskImpact: "MEDIUM",
          buildHash: "sha256-build",
          sbomHash: "sha256-sbom",
          testResultsSummaryHash: "sha256-tests",
          productionDeployRequested: true,
          deployedAt: null
        }
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("blocks production deploy flag update before approval signature", async () => {
    mocks.releaseFindFirst.mockResolvedValueOnce({
      id: "rel1",
      approvedSignatureId: null
    });

    await expect(
      updateReleaseEntry({
        organizationId: "org1",
        releaseId: "rel1",
        actorUserId: "u1",
        patch: { productionDeployRequested: true }
      })
    ).rejects.toBeInstanceOf(ApiError);
  });
});
