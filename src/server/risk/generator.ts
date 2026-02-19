import { createHash } from "node:crypto";
import { controlsForHazard, resolveHazardCategory, riskTaxonomy } from "@/server/risk/taxonomy";
import { computeInitialRisk, computeResidualRisk } from "@/server/risk/scoring";
import { validateDocumentPayload } from "@/server/schemas/validator";

type UrsRequirement = {
  req_id: string;
  category: string;
  statement: string;
  test_method?: string;
  criticality?: string;
};

type RaRisk = {
  risk_id: string;
  hazard: string;
  cause: string;
  impact: string;
  severity: number;
  occurrence: number;
  detection: number;
  initial_risk: number;
  controls: string[];
  residual_risk: number;
  linked_req_ids: string[];
  verification_test_ids: string[];
};

const scoringFromCriticality = (criticality?: string) => {
  const value = (criticality ?? "").toUpperCase();
  if (value === "HIGH") return { severity: 5, occurrence: 3, detection: 3 };
  if (value === "MEDIUM") return { severity: 4, occurrence: 3, detection: 2 };
  return { severity: 3, occurrence: 2, detection: 2 };
};

export const parseUrsRequirementsFromContent = (content: string): UrsRequirement[] => {
  try {
    const json = JSON.parse(content) as { requirements?: UrsRequirement[] };
    if (Array.isArray(json.requirements) && json.requirements.length > 0) {
      return json.requirements;
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
        test_method: parts[5] ?? "Doc Review",
        criticality: parts[6] ?? "MEDIUM"
      };
    })
    .filter((item) => item.req_id);
};

export const generateRaPayloadFromUrs = (params: {
  systemName: string;
  equipmentId: string;
  generatedBy: string;
  requirements: UrsRequirement[];
  generatedAt?: string;
}) => {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const risks: RaRisk[] = params.requirements.map((requirement, index) => {
    const hazard = resolveHazardCategory(requirement.category, requirement.statement);
    const controls = controlsForHazard(hazard.name).slice(0, 3);
    const scoring = scoringFromCriticality(requirement.criticality);
    const initialRisk = computeInitialRisk(scoring);
    const residualRisk = computeResidualRisk({
      initialRisk,
      controlEffectiveness: controls.map((control) => control.effectiveness)
    });
    const num = String(index + 1).padStart(3, "0");
    const commonCauses = riskTaxonomy.common_causes as Record<string, string[]>;
    const cause = commonCauses[hazard.name]?.[0] ?? "Potential control or process failure";
    return {
      risk_id: `RA-${num}`,
      hazard: hazard.name,
      cause,
      impact: hazard.default_impact,
      severity: scoring.severity,
      occurrence: scoring.occurrence,
      detection: scoring.detection,
      initial_risk: initialRisk,
      controls: controls.map((control) => `${control.name} (${control.verification_test_type})`),
      residual_risk: residualRisk,
      linked_req_ids: [requirement.req_id],
      verification_test_ids: controls.map((control, controlIndex) => `VT-${num}-${controlIndex + 1}`)
    };
  });

  const payload = {
    metadata: {
      doc_type: "RA",
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
        change_summary: "Initial RA generated from URS requirements."
      }
    ],
    risks
  };

  const validation = validateDocumentPayload("ra.v1", payload);
  if (!validation.valid) {
    throw new Error(`Generated RA payload failed schema validation: ${validation.errors.join("; ")}`);
  }

  return payload;
};

export const hashRaPayload = (payload: unknown) => {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
};
