import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  machineFindFirst: vi.fn(),
  equipmentFactFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  generationJobFindFirst: vi.fn(),
  generationJobCreate: vi.fn(),
  generatedDocumentFindFirst: vi.fn(),
  generatedDocumentCreate: vi.fn(),
  generatedDocumentUpdate: vi.fn(),
  generatedDocumentFindMany: vi.fn(),
  documentVersionFindFirst: vi.fn(),
  documentVersionCreate: vi.fn(),
  traceabilityCreateMany: vi.fn(),
  writeAuditEvent: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    machine: { findFirst: mocks.machineFindFirst },
    equipmentFact: { findMany: mocks.equipmentFactFindMany },
    user: { findUnique: mocks.userFindUnique },
    generationJob: { findFirst: mocks.generationJobFindFirst, create: mocks.generationJobCreate },
    generatedDocument: {
      findFirst: mocks.generatedDocumentFindFirst,
      create: mocks.generatedDocumentCreate,
      update: mocks.generatedDocumentUpdate,
      findMany: mocks.generatedDocumentFindMany
    },
    documentVersion: { findFirst: mocks.documentVersionFindFirst, create: mocks.documentVersionCreate },
    traceabilityLink: { createMany: mocks.traceabilityCreateMany }
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { runGenerationPipeline } from "@/server/pipeline/service";

describe("runGenerationPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.machineFindFirst.mockResolvedValue({
      id: "m1",
      name: "TSX Freezer",
      modelNumber: "TSX2320FA20",
      organizationId: "org1"
    });
    mocks.equipmentFactFindMany.mockResolvedValue([
      { factType: "RANGE", key: "temperature_setpoint", value: "-20", units: "C", sourceRef: "FACT:temperature_setpoint" },
      { factType: "UTILITY", key: "line_voltage", value: "120", units: "V", sourceRef: "FACT:line_voltage" }
    ]);
    mocks.userFindUnique.mockResolvedValue({ email: "andrew@qa.org" });
    mocks.generationJobFindFirst.mockResolvedValue(null);
    mocks.generationJobCreate.mockResolvedValue({ id: "job1" });
    mocks.generatedDocumentFindFirst.mockResolvedValue(null);
    let docCounter = 0;
    mocks.generatedDocumentCreate.mockImplementation(async (args: { data: { docType: string; title: string } }) => {
      docCounter += 1;
      return {
        id: `doc${docCounter}`,
        docType: args.data.docType,
        title: args.data.title,
        generationJobId: "job1",
        currentContent: "{}"
      };
    });
    mocks.documentVersionFindFirst.mockResolvedValue(null);
    mocks.documentVersionCreate.mockResolvedValue({ id: "v1" });
    mocks.generatedDocumentFindMany.mockResolvedValue([]);
    mocks.traceabilityCreateMany.mockResolvedValue({ count: 2 });
    mocks.writeAuditEvent.mockResolvedValue(undefined);
  });

  it("runs full pipeline and returns readyForExport true", async () => {
    const result = await runGenerationPipeline({
      organizationId: "org1",
      userId: "u1",
      machineId: "m1",
      intendedUse: "Store temperature-sensitive samples.",
      selectedDocTypes: ["URS", "RID", "IOQ", "OQ", "TRACEABILITY"]
    });

    expect(result.readyForExport).toBe(true);
    expect(result.documents.map((doc) => doc.docType)).toEqual(["URS", "RID", "IOQ", "OQ", "TRACEABILITY"]);
    expect(mocks.documentVersionCreate).toHaveBeenCalledTimes(5);
    for (const call of mocks.documentVersionCreate.mock.calls) {
      expect(call[0].data.contentHash).toEqual(expect.any(String));
    }
    expect(mocks.traceabilityCreateMany).toHaveBeenCalled();
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "pipeline.generate.completed",
        entityType: "GenerationJob"
      })
    );
  });

  it("end-to-end integration: builds URS->RA->IOQ/OQ->TM from sample facts", async () => {
    const result = await runGenerationPipeline({
      organizationId: "org1",
      userId: "u1",
      machineId: "m1",
      intendedUse: "Maintain frozen inventory integrity.",
      selectedDocTypes: ["URS", "RID", "IOQ", "OQ", "TRACEABILITY"]
    });

    expect(result.documents).toHaveLength(5);
    expect(result.qualityIssues).toHaveLength(0);
    expect(result.readyForExport).toBe(true);
  });
});
