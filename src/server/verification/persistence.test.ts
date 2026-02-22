import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  generationJobFindFirst: vi.fn(),
  generationJobCreate: vi.fn(),
  generatedDocumentFindFirst: vi.fn(),
  generatedDocumentUpdate: vi.fn(),
  generatedDocumentCreate: vi.fn(),
  documentVersionFindFirst: vi.fn(),
  documentVersionCreate: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    generationJob: {
      findFirst: mocks.generationJobFindFirst,
      create: mocks.generationJobCreate
    },
    generatedDocument: {
      findFirst: mocks.generatedDocumentFindFirst,
      update: mocks.generatedDocumentUpdate,
      create: mocks.generatedDocumentCreate
    },
    documentVersion: {
      findFirst: mocks.documentVersionFindFirst,
      create: mocks.documentVersionCreate
    }
  }
}));

import { persistGeneratedPayload } from "@/server/verification/persistence";

describe("persistGeneratedPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generationJobFindFirst.mockResolvedValue({ id: "job1" });
    mocks.generatedDocumentFindFirst.mockResolvedValue(null);
    mocks.generatedDocumentCreate.mockResolvedValue({ id: "doc1", status: "DRAFT" });
    mocks.generatedDocumentUpdate.mockResolvedValue({ id: "doc1", status: "IN_REVIEW" });
    mocks.documentVersionFindFirst.mockResolvedValue({ versionNumber: 2 });
    mocks.documentVersionCreate.mockResolvedValue({ id: "v3" });
  });

  it("rejects regeneration when existing document is approved", async () => {
    mocks.generatedDocumentFindFirst.mockResolvedValueOnce({
      id: "doc-approved",
      status: "APPROVED"
    });

    await expect(
      persistGeneratedPayload({
        organizationId: "org1",
        userId: "u1",
        machineId: "m1",
        docType: "URS",
        title: "URS",
        payload: { hello: "world" },
        citations: {},
        changeComment: "regen"
      })
    ).rejects.toBeInstanceOf(ApiError);
    expect(mocks.generatedDocumentUpdate).not.toHaveBeenCalled();
  });

  it("creates a new version for mutable documents", async () => {
    mocks.generatedDocumentFindFirst.mockResolvedValueOnce({
      id: "doc1",
      status: "IN_REVIEW"
    });

    await persistGeneratedPayload({
      organizationId: "org1",
      userId: "u1",
      machineId: "m1",
      docType: "URS",
      title: "URS",
      payload: { hello: "world" },
      citations: {},
      changeComment: "regen"
    });

    expect(mocks.generatedDocumentUpdate).toHaveBeenCalled();
    expect(mocks.documentVersionCreate).toHaveBeenCalled();
  });
});

