import { DocType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { FactModel } from "@/server/extract/factModel";
import { buildTemplateSuggestions } from "@/server/templates/suggestions";

type GeneratedUrsRequirement = {
  reqId: string;
  category: string;
  statement: string;
  rationale: string;
  sourceRefs: string[];
  acceptanceCriteria: string;
  testMethod: "IQ" | "OQ" | "Doc Review";
  criticality: "HIGH" | "MEDIUM" | "LOW";
  linkedRiskIds: string[];
  linkedTestIds: string[];
};

const preExecutionDocs: DocType[] = [
  DocType.URS,
  DocType.SIA,
  DocType.RID,
  DocType.DIA,
  DocType.IOQ,
  DocType.TRACEABILITY
];

const postExecutionDocs: DocType[] = [
  DocType.PROTOCOL_SUMMARY,
  DocType.SUMMARY,
  DocType.EXECUTED_PROTOCOL
];

const asCitationLine = (citation: FactModel["citations"][number]) => {
  return `[source:${citation.sourceDocumentId} p.${citation.page} sec.${citation.section}] ${citation.evidence}`;
};

const applyTemplate = (template: string, values: Record<string, string>) => {
  return Object.entries(values).reduce((acc, [key, value]) => {
    return acc.replaceAll(`{{${key}}}`, value);
  }, template);
};

const buildUrsRequirementsFromFacts = (params: {
  facts: Array<{ factType: string; key: string; value: string; units: string | null; sourceRef: string | null }>;
  intendedUse: string;
  selectedCategories: string[];
}) => {
  const { facts, intendedUse, selectedCategories } = params;
  const categorySet = new Set(selectedCategories.map((item) => item.toUpperCase()));
  const scopedFacts =
    categorySet.size === 0
      ? facts
      : facts.filter((fact) => categorySet.has(fact.factType.toUpperCase()));

  return scopedFacts.map<GeneratedUrsRequirement>((fact, index) => {
    const num = String(index + 1).padStart(3, "0");
    const category = fact.factType.toUpperCase();
    const valueWithUnits = fact.units ? `${fact.value} ${fact.units}` : fact.value;
    const method: GeneratedUrsRequirement["testMethod"] =
      category.includes("RANGE") || category.includes("PERFORMANCE") ? "OQ" : category.includes("IDENT") ? "IQ" : "Doc Review";
    const criticality: GeneratedUrsRequirement["criticality"] =
      category.includes("SAFETY") || category.includes("ALARM") ? "HIGH" : category.includes("RANGE") ? "MEDIUM" : "LOW";
    return {
      reqId: `URS-${num}`,
      category,
      statement: `The system shall satisfy ${fact.key.replace(/_/g, " ")} = ${valueWithUnits}.`,
      rationale: intendedUse ? `Supports intended use: ${intendedUse}` : "Supports validated system operation.",
      sourceRefs: fact.sourceRef ? [fact.sourceRef] : [],
      acceptanceCriteria: `${fact.key.replace(/_/g, " ")} is verified as ${valueWithUnits}.`,
      testMethod: method,
      criticality,
      linkedRiskIds: [`RA-${num}`],
      linkedTestIds: [`TC-${num}`]
    };
  });
};

const asUrsTable = (requirements: GeneratedUrsRequirement[]) => {
  const header =
    "| Req ID | Category | Statement | Acceptance Criteria | Test Method | Criticality | Linked Risks | Linked Tests |\n|---|---|---|---|---|---|---|---|";
  const rows = requirements.map((req) => {
    return `| ${req.reqId} | ${req.category} | ${req.statement} | ${req.acceptanceCriteria} | ${req.testMethod} | ${req.criticality} | ${req.linkedRiskIds.join(", ")} | ${req.linkedTestIds.join(", ")} |`;
  });
  return [header, ...rows].join("\n");
};

const buildPlainEnglishProtocolSummary = (params: {
  machineName: string;
  factModel: FactModel;
}) => {
  const rangeLine =
    params.factModel.processRanges.length > 0
      ? params.factModel.processRanges
          .map((range) => `${range.parameter} ${range.min}-${range.max} ${range.units}`)
          .join("; ")
      : "No operating range was extracted.";

  return [
    `# ${params.machineName} Protocol Summary`,
    "",
    "This summary is written in simple English.",
    "",
    "## What Was Reviewed",
    "- The executed protocol and attached evidence.",
    "- Key equipment settings and limits.",
    "",
    "## Main Result",
    "- The execution package was reviewed for completion and major issues.",
    "",
    "## Key Operating Range",
    `- ${rangeLine}`,
    "",
    "## Next Actions",
    "- Resolve any open deviations, then finalize QA approval.",
    "- Keep all evidence files linked to the unit record."
  ].join("\n");
};

export const generateValidationPackage = async (params: {
  organizationId: string;
  machineId: string;
  userId: string;
  factModel: FactModel;
  phase?: "pre_execution" | "post_execution";
  intendedUseText?: string;
  requirementCategories?: string[];
}) => {
  const { organizationId, machineId, userId, factModel } = params;
  const phase = params.phase ?? "pre_execution";
  const docOrder = phase === "post_execution" ? postExecutionDocs : preExecutionDocs;
  const requirementCategories = params.requirementCategories ?? [];

  const machine = await prisma.machine.findFirstOrThrow({
    where: { id: machineId, organizationId }
  });

  const job = await prisma.generationJob.create({
    data: {
      organizationId,
      machineId,
      createdByUserId: userId,
      status: "RUNNING",
      startedAt: new Date()
    }
  });

  const templates = await prisma.documentTemplate.findMany({
    where: {
      organizationId,
      status: "APPROVED"
    },
    orderBy: [{ approvedAt: "desc" }, { version: "desc" }, { createdAt: "desc" }]
  });
  const equipmentFacts = await prisma.equipmentFact.findMany({
    where: { organizationId, machineId },
    orderBy: [{ factType: "asc" }, { key: "asc" }, { createdAt: "asc" }]
  });
  const intendedUse = params.intendedUseText ?? factModel.intendedUse ?? "";
  const ursRequirements = buildUrsRequirementsFromFacts({
    facts: equipmentFacts.map((fact) => ({
      factType: fact.factType,
      key: fact.key,
      value: fact.value,
      units: fact.units,
      sourceRef: fact.sourceRef
    })),
    intendedUse,
    selectedCategories: requirementCategories
  });

  for (const docType of docOrder) {
    const templatesForDocType = templates.filter((item) => item.docType === docType && item.status === "APPROVED");
    const primaryTemplate =
      templatesForDocType.find((item) => item.isPrimary) ??
      templatesForDocType[0];
    const synthesizedTemplate = templatesForDocType.length > 1
      ? buildTemplateSuggestions({
          docType,
          samples: templatesForDocType.map((item) => item.contentTemplate)
        })[0]?.contentTemplate
      : undefined;
    const defaultTemplate = `# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Key Facts\n{{FACTS}}\n\n## Citations\n{{CITATIONS}}`;

    const citationLines = factModel.citations.slice(0, 10).map(asCitationLine).join("\n");
    const facts = [
      `Intended Use: ${factModel.intendedUse ?? "Not specified in sources"}`,
      `Core Functions: ${factModel.coreFunctions.join(", ") || "Not specified"}`,
      `Utilities: ${factModel.utilities.join(", ") || "Not specified"}`,
      `Safety Features: ${factModel.safetyFeatures.join(", ") || "Not specified"}`,
      `Sensors: ${factModel.sensors.join(", ") || "Not specified"}`,
      `Data Interfaces: ${factModel.dataInterfaces.join(", ") || "Not specified"}`,
      `Software Version: ${factModel.softwareVersion ?? "Not specified"}`,
      `Process Ranges: ${factModel.processRanges
        .map((range) => `${range.parameter} ${range.min}-${range.max} ${range.units}`)
        .join("; ") || "Not specified"}`
    ].join("\n");

    const selectedTemplate = primaryTemplate?.contentTemplate ?? synthesizedTemplate ?? defaultTemplate;
    const content =
      docType === DocType.PROTOCOL_SUMMARY && phase === "post_execution"
        ? buildPlainEnglishProtocolSummary({
            machineName: machine.name,
            factModel
          })
        : applyTemplate(selectedTemplate, {
            DOC_TITLE: `${docType} Draft`,
            MACHINE_NAME: machine.name,
            FACTS: facts,
            CITATIONS: citationLines,
            URS_TABLE: docType === DocType.URS ? asUrsTable(ursRequirements) : ""
          }) + (docType === DocType.URS && ursRequirements.length > 0 ? `\n\n## Auto-Generated Requirements\n${asUrsTable(ursRequirements)}` : "");

    const document = await prisma.generatedDocument.create({
      data: {
        organizationId,
        generationJobId: job.id,
        templateId: primaryTemplate?.templateId ?? null,
        templateVersion: primaryTemplate?.version ?? null,
        templateRecordId: primaryTemplate?.id ?? null,
        docType,
        stage: phase === "post_execution" ? "POST_EXECUTION" : "PRE_EXECUTION",
        title: `${machine.name} ${docType}`,
        currentContent: content,
        citationsJson: JSON.stringify(factModel.citations)
      }
    });

    await prisma.documentVersion.create({
      data: {
        generatedDocumentId: document.id,
        editedByUserId: userId,
        versionNumber: 1,
        contentSnapshot: content,
        changeComment: "Initial draft generated"
      }
    });

    if (docType !== DocType.TRACEABILITY) {
      const rows =
        docType === DocType.URS && ursRequirements.length > 0
          ? ursRequirements.map((req, index) => ({
              organizationId,
              generatedDocumentId: document.id,
              requirementId: req.reqId,
              riskControlId: req.linkedRiskIds[0] ?? `RA-${index + 1}`,
              testCaseId: req.linkedTestIds[0] ?? `TC-${index + 1}`,
              citationSourceId: factModel.citations[index]?.sourceDocumentId,
              citationPage: factModel.citations[index]?.page
            }))
          : Array.from({ length: 3 }).map((_, index) => ({
              organizationId,
              generatedDocumentId: document.id,
              requirementId: `REQ-${docType}-${index + 1}`,
              riskControlId: `RC-${docType}-${index + 1}`,
              testCaseId: `TC-${docType}-${index + 1}`,
              citationSourceId: factModel.citations[index]?.sourceDocumentId,
              citationPage: factModel.citations[index]?.page
            }));

      await prisma.traceabilityLink.createMany({ data: rows });
    }
  }

  await prisma.generationJob.update({
    where: { id: job.id },
    data: { status: "COMPLETE", completedAt: new Date() }
  });

  return await prisma.generationJob.findFirstOrThrow({
    where: { id: job.id, organizationId },
    include: {
      documents: {
        include: {
          versions: true,
          traceLinks: true
        }
      }
    }
  });
};
