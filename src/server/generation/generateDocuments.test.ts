import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    machine: { findFirstOrThrow: vi.fn() },
    generationJob: { create: vi.fn(), update: vi.fn(), findFirstOrThrow: vi.fn() },
    documentTemplate: { findMany: vi.fn() },
    equipmentFact: { findMany: vi.fn() },
    generatedDocument: { create: vi.fn() },
    documentVersion: { create: vi.fn() },
    traceabilityLink: { createMany: vi.fn() }
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: prismaMock
}));

import { generateValidationPackage } from "@/server/generation/generateDocuments";

describe("generateValidationPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.machine.findFirstOrThrow.mockResolvedValue({ id: "m1", name: "Bio Reactor" });
    prismaMock.generationJob.create.mockResolvedValue({ id: "job1" });
    prismaMock.generationJob.update.mockResolvedValue({});
    prismaMock.documentTemplate.findMany.mockResolvedValue([]);
    prismaMock.equipmentFact.findMany.mockResolvedValue([
      { factType: "RANGE", key: "temperature_range", value: "2-8", units: "C", sourceRef: "manual p12", createdAt: new Date() }
    ]);
    prismaMock.generatedDocument.create.mockResolvedValue({ id: "doc1" });
    prismaMock.documentVersion.create.mockResolvedValue({});
    prismaMock.traceabilityLink.createMany.mockResolvedValue({});
    prismaMock.generationJob.findFirstOrThrow.mockResolvedValue({ id: "job1", documents: [] });
  });

  it("creates a generation job and output documents", async () => {
    const result = await generateValidationPackage({
      organizationId: "org1",
      machineId: "m1",
      userId: "u1",
      factModel: {
        intendedUse: "Sterile production",
        coreFunctions: ["mixing"],
        utilities: ["steam"],
        safetyFeatures: ["alarm"],
        sensors: ["temperature"],
        dataInterfaces: ["opc"],
        softwareVersion: "v1.2",
        processRanges: [{ parameter: "temperature", min: 2, max: 8, units: "C" }],
        citations: [{ sourceDocumentId: "s1", page: 1, section: "1", evidence: "temp range" }]
      }
    });

    expect(prismaMock.generationJob.create).toHaveBeenCalled();
    expect(prismaMock.generatedDocument.create).toHaveBeenCalled();
    expect(prismaMock.documentVersion.create).toHaveBeenCalled();
    expect(prismaMock.equipmentFact.findMany).toHaveBeenCalled();
    expect(result.id).toBe("job1");
  });

  it("creates a plain-English protocol summary for post-execution", async () => {
    await generateValidationPackage({
      organizationId: "org1",
      machineId: "m1",
      userId: "u1",
      phase: "post_execution",
      factModel: {
        intendedUse: "Sterile production",
        coreFunctions: ["mixing"],
        utilities: ["steam"],
        safetyFeatures: ["alarm"],
        sensors: ["temperature"],
        dataInterfaces: ["opc"],
        softwareVersion: "v1.2",
        processRanges: [{ parameter: "temperature", min: 2, max: 8, units: "C" }],
        citations: [{ sourceDocumentId: "s1", page: 1, section: "1", evidence: "temp range" }]
      }
    });

    const summaryCall = prismaMock.generatedDocument.create.mock.calls.find(
      (call) => call[0]?.data?.docType === "PROTOCOL_SUMMARY"
    );
    expect(summaryCall).toBeDefined();
    expect(summaryCall?.[0]?.data?.currentContent).toContain("simple English");
  });

  it("does not use draft or retired templates for generation", async () => {
    prismaMock.documentTemplate.findMany.mockResolvedValue([
      { id: "t1", docType: "URS", status: "DRAFT", contentTemplate: "DRAFT TEMPLATE SHOULD NOT BE USED" },
      { id: "t2", docType: "URS", status: "RETIRED", contentTemplate: "RETIRED TEMPLATE SHOULD NOT BE USED" }
    ]);

    await generateValidationPackage({
      organizationId: "org1",
      machineId: "m1",
      userId: "u1",
      factModel: {
        intendedUse: "Sterile production",
        coreFunctions: ["mixing"],
        utilities: ["steam"],
        safetyFeatures: ["alarm"],
        sensors: ["temperature"],
        dataInterfaces: ["opc"],
        softwareVersion: "v1.2",
        processRanges: [{ parameter: "temperature", min: 2, max: 8, units: "C" }],
        citations: [{ sourceDocumentId: "s1", page: 1, section: "1", evidence: "temp range" }]
      }
    });

    const ursCall = prismaMock.generatedDocument.create.mock.calls.find(
      (call) => call[0]?.data?.docType === "URS"
    );
    expect(ursCall?.[0]?.data?.currentContent).not.toContain("DRAFT TEMPLATE SHOULD NOT BE USED");
    expect(ursCall?.[0]?.data?.currentContent).not.toContain("RETIRED TEMPLATE SHOULD NOT BE USED");
  });

  it("stores template id and version used for generated documents", async () => {
    prismaMock.documentTemplate.findMany.mockResolvedValue([
      {
        id: "tpl-version-3",
        templateId: "tpl-family-1",
        version: 3,
        status: "APPROVED",
        isPrimary: true,
        docType: "URS",
        contentTemplate: "# {{DOC_TITLE}}\n\nApproved URS template"
      }
    ]);

    await generateValidationPackage({
      organizationId: "org1",
      machineId: "m1",
      userId: "u1",
      factModel: {
        intendedUse: "Sterile production",
        coreFunctions: ["mixing"],
        utilities: ["steam"],
        safetyFeatures: ["alarm"],
        sensors: ["temperature"],
        dataInterfaces: ["opc"],
        softwareVersion: "v1.2",
        processRanges: [{ parameter: "temperature", min: 2, max: 8, units: "C" }],
        citations: [{ sourceDocumentId: "s1", page: 1, section: "1", evidence: "temp range" }]
      }
    });

    const ursCall = prismaMock.generatedDocument.create.mock.calls.find(
      (call) => call[0]?.data?.docType === "URS"
    );
    expect(ursCall?.[0]?.data?.templateId).toBe("tpl-family-1");
    expect(ursCall?.[0]?.data?.templateVersion).toBe(3);
    expect(ursCall?.[0]?.data?.templateRecordId).toBe("tpl-version-3");
  });
});
