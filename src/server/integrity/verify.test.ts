import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  versionFindFirst: vi.fn(),
  exportFindFirst: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    documentVersion: {
      findFirst: mocks.versionFindFirst
    },
    documentExport: {
      findFirst: mocks.exportFindFirst
    }
  }
}));

import { verifyDocumentVersionIntegrity, verifyDocumentExportIntegrity } from "@/server/integrity/verify";

describe("integrity verification service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies document version content hash", async () => {
    mocks.versionFindFirst.mockResolvedValueOnce({
      id: "v1",
      generatedDocumentId: "doc1",
      contentSnapshot: "{\"b\":2,\"a\":1}",
      contentHash: createHash("sha256").update("{\"a\":1,\"b\":2}").digest("hex")
    });

    const result = await verifyDocumentVersionIntegrity({
      organizationId: "org1",
      documentId: "doc1",
      versionId: "v1"
    });

    expect(result.matches).toBe(true);
  });

  it("detects tampered export file hash mismatch", async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), "storage", "integrity-test-"));
    const filePath = path.join(tempDir, "artifact.docx");

    await fs.writeFile(filePath, "original-bytes");
    const expectedHash = createHash("sha256").update("original-bytes").digest("hex");

    mocks.exportFindFirst.mockResolvedValue({
      id: "exp1",
      exportId: "expid1",
      docId: "doc1",
      path: filePath,
      hash: expectedHash,
      format: "docx"
    });

    const initial = await verifyDocumentExportIntegrity({
      organizationId: "org1",
      documentId: "doc1",
      exportId: "expid1"
    });
    expect(initial.matches).toBe(true);

    await fs.writeFile(filePath, "tampered-bytes");
    const tampered = await verifyDocumentExportIntegrity({
      organizationId: "org1",
      documentId: "doc1",
      exportId: "expid1"
    });
    expect(tampered.matches).toBe(false);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
