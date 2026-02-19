import { generateRaPayloadFromUrs } from "@/server/risk/generator";
import { generateIoqPayload, generateOqPayload, generateTraceabilityMatrixPayload } from "@/server/verification/generator";
import { validateDocumentPayload } from "@/server/schemas/validator";

type PipelineFact = {
  factType: string;
  key: string;
  value: string;
  units?: string | null;
  sourceRef?: string | null;
};

const toUpper = (value: string) => value.trim().toUpperCase();

const normalizeFacts = (facts: PipelineFact[]) =>
  [...facts]
    .sort((a, b) => {
      const left = `${toUpper(a.factType)}:${a.key.toLowerCase()}:${a.value.toLowerCase()}`;
      const right = `${toUpper(b.factType)}:${b.key.toLowerCase()}:${b.value.toLowerCase()}`;
      return left.localeCompare(right);
    })
    .map((fact) => ({
      ...fact,
      factType: toUpper(fact.factType),
      sourceRef: fact.sourceRef?.trim() || `FACT:${fact.key}`
    }));

const buildUrsPayload = (params: {
  systemName: string;
  equipmentId: string;
  generatedBy: string;
  generatedAt: string;
  intendedUse: string;
  facts: PipelineFact[];
}) => {
  const facts = normalizeFacts(params.facts);
  const requirements = facts.map((fact, index) => {
    const reqId = `URS-${String(index + 1).padStart(3, "0")}`;
    const testMethod = fact.factType.includes("RANGE") || fact.factType.includes("PERFORMANCE") ? "OQ" : "Doc Review";
    const criticality = fact.factType.includes("SAFETY") || fact.factType.includes("ALARM") ? "HIGH" : fact.factType.includes("RANGE") ? "MEDIUM" : "LOW";
    const renderedValue = fact.units ? `${fact.value} ${fact.units}` : fact.value;
    return {
      req_id: reqId,
      category: fact.factType,
      statement: `The system shall meet ${fact.key.replaceAll("_", " ")} at ${renderedValue}.`,
      rationale: params.intendedUse
        ? `Supports intended use: ${params.intendedUse}`
        : "Supports intended equipment operation.",
      source_refs: [fact.sourceRef ?? `FACT:${fact.key}`],
      acceptance_criteria: `${fact.key.replaceAll("_", " ")} is verified at ${renderedValue}.`,
      test_method: testMethod,
      criticality,
      linked_risk_ids: [`RA-${String(index + 1).padStart(3, "0")}`]
    };
  });

  const payload = {
    metadata: {
      doc_type: "URS",
      doc_version: "v1",
      system_name: params.systemName,
      equipment_id: params.equipmentId,
      generated_at: params.generatedAt,
      generated_by: params.generatedBy
    },
    revision_history: [
      {
        version: "v1.0",
        changed_at: params.generatedAt,
        changed_by: params.generatedBy,
        change_summary: "Initial URS generated from equipment facts and intended use."
      }
    ],
    requirements
  };
  const validation = validateDocumentPayload("urs.v1", payload);
  if (!validation.valid) {
    throw new Error(`Generated URS payload failed schema validation: ${validation.errors.join("; ")}`);
  }
  return payload;
};

export const buildPipelineArtifacts = (params: {
  systemName: string;
  equipmentId: string;
  generatedBy: string;
  generatedAt: string;
  intendedUse: string;
  facts: PipelineFact[];
}) => {
  const ursPayload = buildUrsPayload(params);
  const raPayload = generateRaPayloadFromUrs({
    systemName: params.systemName,
    equipmentId: params.equipmentId,
    generatedBy: params.generatedBy,
    generatedAt: params.generatedAt,
    requirements: ursPayload.requirements.map((item) => ({
      req_id: item.req_id,
      category: item.category,
      statement: item.statement,
      test_method: item.test_method,
      criticality: item.criticality
    }))
  });
  const ioqPayload = generateIoqPayload({
    systemName: params.systemName,
    equipmentId: params.equipmentId,
    generatedBy: params.generatedBy,
    generatedAt: params.generatedAt,
    facts: normalizeFacts(params.facts).map((fact) => ({ key: fact.key, value: fact.value, units: fact.units })),
    ursRequirements: ursPayload.requirements
  });
  const oqPayload = generateOqPayload({
    systemName: params.systemName,
    equipmentId: params.equipmentId,
    generatedBy: params.generatedBy,
    generatedAt: params.generatedAt,
    ursRequirements: ursPayload.requirements,
    raRisks: raPayload.risks
  });
  const tmPayload = generateTraceabilityMatrixPayload({
    systemName: params.systemName,
    equipmentId: params.equipmentId,
    generatedBy: params.generatedBy,
    generatedAt: params.generatedAt,
    ursRequirements: ursPayload.requirements,
    raRisks: raPayload.risks,
    ioqTestCases: ioqPayload.test_cases,
    oqTestCases: oqPayload.test_cases,
    outputRefPrefix: params.equipmentId
  });

  return {
    ursPayload,
    raPayload,
    ioqPayload,
    oqPayload,
    tmPayload
  };
};
