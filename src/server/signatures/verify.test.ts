import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  signatureFindFirst: vi.fn(),
  versionFindFirst: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    electronicSignature: {
      findFirst: mocks.signatureFindFirst
    },
    documentVersion: {
      findFirst: mocks.versionFindFirst
    }
  }
}));

import { verifyElectronicSignatureBinding } from "@/server/signatures/verify";
import { hashRecordContent } from "@/server/signatures/manifest";

describe("verifyElectronicSignatureBinding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid=true when signature manifest matches version content", async () => {
    const content = "{\"a\":1}";
    const manifest = hashRecordContent(content);
    mocks.signatureFindFirst.mockResolvedValueOnce({
      id: "sig1",
      recordId: "doc1",
      recordVersionId: "v1",
      signatureManifest: manifest
    });
    mocks.versionFindFirst.mockResolvedValueOnce({
      id: "v1",
      state: "IN_REVIEW",
      contentSnapshot: content
    });

    const result = await verifyElectronicSignatureBinding({
      organizationId: "org1",
      signatureId: "sig1"
    });

    expect(result.valid).toBe(true);
    expect(result.reason).toBe("ok");
  });

  it("returns valid=false when content changed after signing", async () => {
    mocks.signatureFindFirst.mockResolvedValueOnce({
      id: "sig1",
      recordId: "doc1",
      recordVersionId: "v1",
      signatureManifest: hashRecordContent("{\"a\":1}")
    });
    mocks.versionFindFirst.mockResolvedValueOnce({
      id: "v1",
      state: "DRAFT",
      contentSnapshot: "{\"a\":2}"
    });

    const result = await verifyElectronicSignatureBinding({
      organizationId: "org1",
      signatureId: "sig1"
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("content_manifest_mismatch");
  });

  it("throws when signature does not exist", async () => {
    mocks.signatureFindFirst.mockResolvedValueOnce(null);
    await expect(
      verifyElectronicSignatureBinding({
        organizationId: "org1",
        signatureId: "sig1"
      })
    ).rejects.toBeInstanceOf(ApiError);
  });
});

