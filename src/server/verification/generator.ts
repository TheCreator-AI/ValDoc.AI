import { createHash } from "node:crypto";
import { validateDocumentPayload } from "@/server/schemas/validator";

export type EquipmentFactInput = {
  key: string;
  value: string;
  units?: string | null;
};

export type UrsRequirementInput = {
  req_id: string;
  category: string;
  statement: string;
  acceptance_criteria?: string;
  linked_risk_ids?: string[];
};

export type RaRiskInput = {
  risk_id: string;
  controls: string[];
  linked_req_ids: string[];
  verification_test_ids: string[];
};

type ProtocolTestCase = {
  test_id: string;
  linked_req_ids: string[];
  linked_risk_ids: string[];
};

const ioqChecklistBlueprint = [
  {
    testId: "IOQ-001",
    title: "Utilities Verification",
    keywords: ["utility", "utilities", "voltage", "power", "electrical"],
    factHints: ["voltage", "power", "utility"],
    evidence: "Utility connection record, photographs, and commissioning checklist."
  },
  {
    testId: "IOQ-002",
    title: "Model and Serial Capture",
    keywords: ["model", "serial", "identification"],
    factHints: ["model", "serial"],
    evidence: "Nameplate photos and asset register entry."
  },
  {
    testId: "IOQ-003",
    title: "Software/Firmware Verification",
    keywords: ["software", "firmware", "version", "application"],
    factHints: ["firmware", "software", "version"],
    evidence: "Version screenshot or service report."
  },
  {
    testId: "IOQ-004",
    title: "Calibration Status Verification",
    keywords: ["calibration", "metrology", "sensor"],
    factHints: ["calibration", "probe", "sensor"],
    evidence: "Current calibration certificate and due date record."
  },
  {
    testId: "IOQ-005",
    title: "Environmental Requirements Verification",
    keywords: ["environment", "ambient", "room", "temperature", "humidity"],
    factHints: ["ambient", "temperature", "humidity"],
    evidence: "Environmental log and room condition snapshot."
  }
] as const;

const normalize = (value: string) => value.toLowerCase();

const parseCsvIds = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const findReqLinks = (requirements: UrsRequirementInput[], keywords: readonly string[]) => {
  const loweredKeywords = keywords.map(normalize);
  return requirements
    .filter((req) => {
      const searchable = `${req.category} ${req.statement}`.toLowerCase();
      return loweredKeywords.some((keyword) => searchable.includes(keyword));
    })
    .map((req) => req.req_id);
};

const findRiskLinksForReqs = (requirements: UrsRequirementInput[], reqIds: string[]) => {
  const reqSet = new Set(reqIds);
  return unique(
    requirements
      .filter((req) => reqSet.has(req.req_id))
      .flatMap((req) => req.linked_risk_ids ?? [])
      .filter(Boolean)
  );
};

const findFactSummary = (facts: EquipmentFactInput[], hints: readonly string[]) => {
  const loweredHints = hints.map(normalize);
  const matched = facts.filter((fact) => loweredHints.some((hint) => normalize(fact.key).includes(hint)));
  if (matched.length === 0) return "No matching structured fact captured.";
  return matched.map((fact) => `${fact.key}=${fact.value}${fact.units ? ` ${fact.units}` : ""}`).join("; ");
};

export const parseUrsRequirementsFromDocumentContent = (content: string): UrsRequirementInput[] => {
  try {
    const parsed = JSON.parse(content) as { requirements?: UrsRequirementInput[] };
    if (Array.isArray(parsed.requirements) && parsed.requirements.length > 0) {
      return parsed.requirements
        .map((req) => ({
          req_id: req.req_id,
          category: req.category,
          statement: req.statement,
          acceptance_criteria: req.acceptance_criteria ?? "",
          linked_risk_ids: req.linked_risk_ids ?? []
        }))
        .filter((req) => req.req_id && req.statement);
    }
  } catch {
    // markdown fallback below
  }

  return content
    .split("\n")
    .filter((line) => line.trim().startsWith("| URS-"))
    .map((line) => {
      const parts = line.split("|").map((cell) => cell.trim());
      return {
        req_id: parts[1] ?? "",
        category: parts[2] ?? "General",
        statement: parts[3] ?? "",
        acceptance_criteria: parts[4] ?? "",
        linked_risk_ids: parseCsvIds(parts[7] ?? "")
      };
    })
    .filter((req) => req.req_id && req.statement);
};

export const parseRaRisksFromDocumentContent = (content: string): RaRiskInput[] => {
  try {
    const parsed = JSON.parse(content) as { risks?: RaRiskInput[] };
    if (Array.isArray(parsed.risks) && parsed.risks.length > 0) {
      return parsed.risks
        .map((risk) => ({
          risk_id: risk.risk_id,
          controls: risk.controls ?? [],
          linked_req_ids: risk.linked_req_ids ?? [],
          verification_test_ids: risk.verification_test_ids ?? []
        }))
        .filter((risk) => risk.risk_id);
    }
  } catch {
    return [];
  }
  return [];
};

export const parseProtocolTestCasesFromDocumentContent = (content: string): ProtocolTestCase[] => {
  try {
    const parsed = JSON.parse(content) as { test_cases?: ProtocolTestCase[] };
    if (Array.isArray(parsed.test_cases)) {
      return parsed.test_cases
        .map((testCase) => ({
          test_id: testCase.test_id,
          linked_req_ids: testCase.linked_req_ids ?? [],
          linked_risk_ids: testCase.linked_risk_ids ?? []
        }))
        .filter((testCase) => testCase.test_id);
    }
  } catch {
    return [];
  }
  return [];
};

export const generateIoqPayload = (params: {
  systemName: string;
  equipmentId: string;
  generatedBy: string;
  facts: EquipmentFactInput[];
  ursRequirements: UrsRequirementInput[];
  generatedAt?: string;
}) => {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const testCases = ioqChecklistBlueprint.map((item) => {
    const linkedReqIds = findReqLinks(params.ursRequirements, item.keywords);
    const linkedRiskIds = findRiskLinksForReqs(params.ursRequirements, linkedReqIds);
    const fallbackFactLink = params.facts[0] ? [`FACT:${params.facts[0].key}`] : [];
    const factSummary = findFactSummary(params.facts, item.factHints);

    return {
      test_id: item.testId,
      objective: `Verify ${item.title.toLowerCase()} is installed/configured as defined.`,
      prerequisites: [
        "Approved installation package is available.",
        "Equipment is safe to inspect in installation state."
      ],
      steps: [
        `Inspect ${item.title.toLowerCase()} against configured baseline and recorded facts.`,
        "Record actual observed values and installation evidence.",
        "Compare observed state to expected installation criteria and document deviations."
      ],
      expected_results: [
        `${item.title} is compliant with installation requirements.`,
        `Fact alignment: ${factSummary}`
      ],
      evidence_required: item.evidence,
      pass_fail: "PENDING",
      linked_req_ids: linkedReqIds.length > 0 ? linkedReqIds : fallbackFactLink,
      linked_risk_ids: linkedRiskIds
    };
  });

  const payload = {
    metadata: {
      doc_type: "IOQ",
      doc_version: "v1",
      system_name: params.systemName,
      equipment_id: params.equipmentId,
      generated_at: generatedAt,
      generated_by: params.generatedBy
    },
    revision_history: [
      {
        version: "v1.0",
        changed_at: generatedAt,
        changed_by: params.generatedBy,
        change_summary: "Initial deterministic IOQ protocol generated."
      }
    ],
    test_cases: testCases
  };

  const validation = validateDocumentPayload("ioq.v1", payload);
  if (!validation.valid) {
    throw new Error(`Generated IOQ payload failed schema validation: ${validation.errors.join("; ")}`);
  }

  return payload;
};

export const generateOqPayload = (params: {
  systemName: string;
  equipmentId: string;
  generatedBy: string;
  ursRequirements: UrsRequirementInput[];
  raRisks: RaRiskInput[];
  generatedAt?: string;
}) => {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const testCases = params.ursRequirements.map((requirement, index) => {
    const matchedRisks = params.raRisks.filter((risk) => risk.linked_req_ids.includes(requirement.req_id));
    const riskIds = unique([
      ...matchedRisks.map((risk) => risk.risk_id),
      ...(requirement.linked_risk_ids ?? [])
    ]);
    const controls = unique(matchedRisks.flatMap((risk) => risk.controls));
    const testId = `OQ-${String(index + 1).padStart(3, "0")}`;
    const acceptanceCriteria = requirement.acceptance_criteria?.trim() || "Requirement-specific acceptance criteria met.";

    return {
      test_id: testId,
      objective: `Verify operational compliance for ${requirement.req_id}.`,
      prerequisites: [
        "Approved URS and RA are available.",
        "Equipment installation qualification is complete."
      ],
      steps: [
        `Configure the equipment for operational challenge of ${requirement.req_id}.`,
        `Execute the challenge against acceptance criteria: ${acceptanceCriteria}`,
        `Confirm associated risk controls are active: ${controls.length > 0 ? controls.join("; ") : "No explicit RA controls listed."}`,
        "Record observations and measured values in the OQ worksheet."
      ],
      expected_results: [
        `Requirement ${requirement.req_id} acceptance criteria achieved.`,
        "Operational behavior remains controlled with no unexplained deviations."
      ],
      evidence_required: "Completed OQ worksheet, raw data capture, and reviewer sign-off.",
      pass_fail: "PENDING",
      linked_req_ids: [requirement.req_id],
      linked_risk_ids: riskIds
    };
  });

  const payload = {
    metadata: {
      doc_type: "OQ",
      doc_version: "v1",
      system_name: params.systemName,
      equipment_id: params.equipmentId,
      generated_at: generatedAt,
      generated_by: params.generatedBy
    },
    revision_history: [
      {
        version: "v1.0",
        changed_at: generatedAt,
        changed_by: params.generatedBy,
        change_summary: "Initial deterministic OQ protocol generated from URS + RA."
      }
    ],
    test_cases: testCases
  };

  const validation = validateDocumentPayload("oq.v1", payload);
  if (!validation.valid) {
    throw new Error(`Generated OQ payload failed schema validation: ${validation.errors.join("; ")}`);
  }

  return payload;
};

export const generateTraceabilityMatrixPayload = (params: {
  systemName: string;
  equipmentId: string;
  generatedBy: string;
  ursRequirements: UrsRequirementInput[];
  raRisks: RaRiskInput[];
  ioqTestCases: ProtocolTestCase[];
  oqTestCases: ProtocolTestCase[];
  outputRefPrefix: string;
  generatedAt?: string;
}) => {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const allTests = [...params.ioqTestCases, ...params.oqTestCases];

  const mappings = params.ursRequirements.map((requirement) => {
    const riskIds = unique([
      ...params.raRisks
        .filter((risk) => risk.linked_req_ids.includes(requirement.req_id))
        .map((risk) => risk.risk_id),
      ...(requirement.linked_risk_ids ?? [])
    ]);

    const testIds = unique(
      allTests
        .filter(
          (testCase) =>
            testCase.linked_req_ids.includes(requirement.req_id) ||
            testCase.linked_risk_ids.some((riskId) => riskIds.includes(riskId))
        )
        .map((testCase) => testCase.test_id)
    );

    return {
      req_id: requirement.req_id,
      risk_ids: riskIds.length > 0 ? riskIds : [`RISK-UNMAPPED-${requirement.req_id}`],
      test_ids: testIds.length > 0 ? testIds : [`TEST-UNMAPPED-${requirement.req_id}`],
      output_reference: {
        template_doc_type: "TM",
        output_document_ref: `${params.outputRefPrefix}/TM`,
        output_section_ref: `REQ:${requirement.req_id}`
      }
    };
  });

  const payload = {
    metadata: {
      doc_type: "TM",
      doc_version: "v1",
      system_name: params.systemName,
      equipment_id: params.equipmentId,
      generated_at: generatedAt,
      generated_by: params.generatedBy
    },
    revision_history: [
      {
        version: "v1.0",
        changed_at: generatedAt,
        changed_by: params.generatedBy,
        change_summary: "Initial traceability matrix generated from URS, RA, IOQ, and OQ."
      }
    ],
    mappings
  };

  const validation = validateDocumentPayload("tm.v1", payload);
  if (!validation.valid) {
    throw new Error(`Generated TM payload failed schema validation: ${validation.errors.join("; ")}`);
  }

  return payload;
};

export const hashPayload = (payload: unknown) => {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
};
