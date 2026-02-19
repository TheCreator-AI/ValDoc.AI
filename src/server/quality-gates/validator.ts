import { DocType } from "@prisma/client";
import ioqOqRules from "./rule-sets/ioq-oq.v1.json";
import raRules from "./rule-sets/ra.v1.json";
import terminologyRules from "./rule-sets/terminology.v1.json";
import traceabilityRules from "./rule-sets/traceability.v1.json";
import ursRules from "./rule-sets/urs.v1.json";

export type QualityIssue = {
  code: string;
  message: string;
};

export type QualityGateResult = {
  ready: boolean;
  issues: QualityIssue[];
  checkedAt: string;
  rulesets: Array<{ docType: string; version: string }>;
};

type GateDocument = {
  id: string;
  docType: DocType;
  currentContent: string;
};

type GateTraceLink = {
  requirementId: string;
  riskControlId: string;
  testCaseId: string;
};

type ParsedDocument = {
  id: string;
  docType: DocType;
  json: Record<string, unknown>;
};

export class QualityGateFailureError extends Error {
  issues: QualityIssue[];

  constructor(issues: QualityIssue[]) {
    super("Document Quality Gate failed.");
    this.issues = issues;
  }
}

const ACRONYM_ALLOWLIST = new Set([
  "API",
  "CAPA",
  "CSV",
  "DIA",
  "DOCX",
  "FDA",
  "GMP",
  "GXP",
  "ID",
  "IOQ",
  "IQ",
  "JSON",
  "OQ",
  "PDF",
  "PQ",
  "HIGH",
  "MEDIUM",
  "LOW",
  "RANGE",
  "UTILITY",
  "SAFETY",
  "FACT",
  "TSX",
  "PENDING",
  "QA",
  "RA",
  "RBAC",
  "RID",
  "SIA",
  "SOP",
  "TM",
  "VT",
  "REQ",
  "RC",
  "TC",
  "URS",
  "ZIP"
]);

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toArray = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const toString = (value: unknown): string => (typeof value === "string" ? value : "");

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseContent = (content: string): Record<string, unknown> => {
  try {
    return toRecord(JSON.parse(content));
  } catch {
    return {};
  }
};

const collectTextValues = (value: unknown, bucket: string[]) => {
  if (typeof value === "string") {
    bucket.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTextValues(item, bucket);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectTextValues(item, bucket);
    }
  }
};

const buildTestMappings = (documents: ParsedDocument[], traceLinks: GateTraceLink[]) => {
  const reqToTests = new Map<string, Set<string>>();
  const riskToTests = new Map<string, Set<string>>();

  const addMapping = (map: Map<string, Set<string>>, key: string, testId: string) => {
    if (!key || !testId) return;
    if (!map.has(key)) map.set(key, new Set<string>());
    map.get(key)?.add(testId);
  };

  for (const doc of documents) {
    if (doc.docType !== DocType.IOQ && doc.docType !== DocType.OQ) continue;
    const testCases = toArray<Record<string, unknown>>(doc.json.test_cases);
    for (const testCase of testCases) {
      const testId = toString(testCase.test_id);
      for (const reqId of toArray<string>(testCase.linked_req_ids)) {
        addMapping(reqToTests, toString(reqId), testId);
      }
      for (const riskId of toArray<string>(testCase.linked_risk_ids)) {
        addMapping(riskToTests, toString(riskId), testId);
      }
    }
  }

  for (const link of traceLinks) {
    addMapping(reqToTests, link.requirementId, link.testCaseId);
    addMapping(riskToTests, link.riskControlId, link.testCaseId);
  }

  return { reqToTests, riskToTests };
};

const hasAnyTestMapping = (map: Map<string, Set<string>>, id: string) => (map.get(id)?.size ?? 0) > 0;

const isHighRisk = (risk: Record<string, unknown>) => {
  const severity = toNumber(risk.severity);
  const initial = toNumber(risk.initial_risk);
  const residual = toNumber(risk.residual_risk);
  if ((severity ?? 0) >= 4) return true;
  if ((initial ?? 0) >= 12 || (residual ?? 0) >= 12) return true;
  const initialText = toString(risk.initial_risk).toUpperCase();
  const residualText = toString(risk.residual_risk).toUpperCase();
  return initialText.includes("HIGH") || residualText.includes("HIGH");
};

export const evaluateDocumentQualityGate = (params: {
  documents: GateDocument[];
  targetDocumentId: string;
  traceLinks?: GateTraceLink[];
}): QualityGateResult => {
  const checkedAt = new Date().toISOString();
  const issues: QualityIssue[] = [];
  const traceLinks = params.traceLinks ?? [];
  const parsedDocs: ParsedDocument[] = params.documents.map((doc) => ({
    id: doc.id,
    docType: doc.docType,
    json: parseContent(doc.currentContent)
  }));
  const target = parsedDocs.find((doc) => doc.id === params.targetDocumentId);

  if (!target) {
    return {
      ready: false,
      checkedAt,
      rulesets: [ursRules, raRules, ioqOqRules, traceabilityRules, terminologyRules],
      issues: [{ code: "TARGET_NOT_FOUND", message: "Target document for quality gate was not found." }]
    };
  }

  if (target.docType === DocType.URS) {
    const requirements = toArray<Record<string, unknown>>(target.json.requirements);
    if (requirements.length === 0) {
      issues.push({ code: "URS_REQUIREMENTS_MISSING", message: "URS must include at least one requirement." });
    }
    for (const requirement of requirements) {
      const reqId = toString(requirement.req_id);
      const statement = toString(requirement.statement);
      const acceptanceCriteria = toString(requirement.acceptance_criteria);
      const testMethod = toString(requirement.test_method);
      const criticality = toString(requirement.criticality);
      const sourceRefs = toArray<string>(requirement.source_refs).map((value) => toString(value)).filter(Boolean);
      if (!reqId) issues.push({ code: "URS_REQ_ID_MISSING", message: "Every URS requirement must include req_id." });
      if (!/\bshall\b/i.test(statement)) {
        issues.push({ code: "URS_STATEMENT_SHALL_REQUIRED", message: `URS requirement ${reqId || "(unknown)"} must include "shall".` });
      }
      if (!acceptanceCriteria.trim()) {
        issues.push({ code: "URS_ACCEPTANCE_REQUIRED", message: `URS requirement ${reqId || "(unknown)"} must include acceptance_criteria.` });
      }
      if (!testMethod.trim()) {
        issues.push({ code: "URS_TEST_METHOD_REQUIRED", message: `URS requirement ${reqId || "(unknown)"} must include test_method.` });
      }
      if (!criticality.trim()) {
        issues.push({ code: "URS_CRITICALITY_REQUIRED", message: `URS requirement ${reqId || "(unknown)"} must include criticality.` });
      }
      const factDerived =
        requirement.fact_derived === true ||
        toString(requirement.source_type).toUpperCase() === "FACT" ||
        toString(requirement.source_origin).toUpperCase() === "FACT";
      if (factDerived && sourceRefs.length === 0) {
        issues.push({
          code: "URS_FACT_SOURCE_REQUIRED",
          message: `URS requirement ${reqId || "(unknown)"} is fact-derived and must include source_refs.`
        });
      }
    }
  }

  if (target.docType === DocType.RID) {
    const risks = toArray<Record<string, unknown>>(target.json.risks);
    if (risks.length === 0) {
      issues.push({ code: "RA_RISKS_MISSING", message: "Risk Assessment must include at least one risk." });
    }
    for (const risk of risks) {
      const riskId = toString(risk.risk_id) || "(unknown)";
      if (toNumber(risk.severity) == null || toNumber(risk.occurrence) == null || toNumber(risk.detection) == null) {
        issues.push({ code: "RA_SCORING_REQUIRED", message: `Risk ${riskId} must include severity, occurrence, and detection.` });
      }
      if (toArray(risk.controls).length < 1) {
        issues.push({ code: "RA_CONTROLS_REQUIRED", message: `Risk ${riskId} must include at least one control.` });
      }
      if (toArray(risk.linked_req_ids).length < 1) {
        issues.push({ code: "RA_LINKED_REQ_REQUIRED", message: `Risk ${riskId} must link to at least one requirement.` });
      }
      if (toArray(risk.verification_test_ids).length < 1) {
        issues.push({ code: "RA_VERIFICATION_REQUIRED", message: `Risk ${riskId} must map to at least one verification test.` });
      }
    }
  }

  if (target.docType === DocType.IOQ || target.docType === DocType.OQ) {
    const tests = toArray<Record<string, unknown>>(target.json.test_cases);
    if (tests.length === 0) {
      issues.push({ code: "TEST_CASES_MISSING", message: `${target.docType} must include test_cases.` });
    }
    for (const testCase of tests) {
      const testId = toString(testCase.test_id) || "(unknown)";
      if (toArray(testCase.steps).length < 1) {
        issues.push({ code: "TEST_STEPS_REQUIRED", message: `Test ${testId} must include steps.` });
      }
      if (toArray(testCase.expected_results).length < 1) {
        issues.push({ code: "TEST_EXPECTED_RESULTS_REQUIRED", message: `Test ${testId} must include expected_results.` });
      }
      const hasReqLinks = toArray(testCase.linked_req_ids).length > 0;
      const hasRiskLinks = toArray(testCase.linked_risk_ids).length > 0;
      if (!hasReqLinks && !hasRiskLinks) {
        issues.push({ code: "TEST_TRACE_LINK_REQUIRED", message: `Test ${testId} must link to req_id(s) and/or risk_id(s).` });
      }
    }
  }

  const { reqToTests, riskToTests } = buildTestMappings(parsedDocs, traceLinks);
  const ursDocuments = parsedDocs.filter((doc) => doc.docType === DocType.URS);
  for (const ursDoc of ursDocuments) {
    const requirements = toArray<Record<string, unknown>>(ursDoc.json.requirements);
    for (const requirement of requirements) {
      const reqId = toString(requirement.req_id);
      const criticality = toString(requirement.criticality).toUpperCase();
      if (reqId && criticality === "HIGH" && !hasAnyTestMapping(reqToTests, reqId)) {
        issues.push({
          code: "TRACE_CRITICAL_REQ_UNMAPPED",
          message: `Critical requirement ${reqId} must map to at least one test.`
        });
      }
    }
  }

  const raDocuments = parsedDocs.filter((doc) => doc.docType === DocType.RID);
  for (const raDoc of raDocuments) {
    const risks = toArray<Record<string, unknown>>(raDoc.json.risks);
    for (const risk of risks) {
      const riskId = toString(risk.risk_id);
      if (!riskId) continue;
      if (isHighRisk(risk) && !hasAnyTestMapping(riskToTests, riskId)) {
        issues.push({
          code: "TRACE_HIGH_RISK_UNMAPPED",
          message: `High risk ${riskId} must map to at least one test.`
        });
      }
    }
  }

  const glossaryTerms = new Set<string>();
  const glossary = toRecord(target.json.glossary);
  for (const key of Object.keys(glossary)) glossaryTerms.add(key.toUpperCase());
  for (const term of toArray<string>(target.json.glossary_terms)) glossaryTerms.add(toString(term).toUpperCase());
  for (const term of toArray<Record<string, unknown>>(target.json.glossary)) {
    const acronym = toString(term.acronym || term.term).toUpperCase();
    if (acronym) glossaryTerms.add(acronym);
  }
  const textFragments: string[] = [];
  collectTextValues(target.json, textFragments);
  const acronyms = new Set((textFragments.join(" ").match(/\b[A-Z]{2,}\b/g) ?? []).map((item) => item.toUpperCase()));
  for (const acronym of acronyms) {
    if (ACRONYM_ALLOWLIST.has(acronym)) continue;
    if (glossaryTerms.has(acronym)) continue;
    issues.push({
      code: "TERMINOLOGY_UNDEFINED_ACRONYM",
      message: `Acronym ${acronym} is used but not defined in glossary.`
    });
  }

  return {
    ready: issues.length === 0,
    issues,
    checkedAt,
    rulesets: [ursRules, raRules, ioqOqRules, traceabilityRules, terminologyRules]
  };
};
