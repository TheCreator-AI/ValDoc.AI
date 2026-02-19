import { describe, expect, it } from "vitest";
import { evaluateDocumentQualityGate } from "./validator";

describe("quality-gate validator rules", () => {
  it("enforces URS field completeness rules", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "urs-1",
      documents: [
        {
          id: "urs-1",
          docType: "URS",
          currentContent: JSON.stringify({
            requirements: [
              {
                req_id: "",
                statement: "Temperature maintained",
                acceptance_criteria: "",
                test_method: "",
                criticality: ""
              }
            ]
          })
        }
      ]
    });

    expect(result.ready).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "URS_REQ_ID_MISSING",
        "URS_STATEMENT_SHALL_REQUIRED",
        "URS_ACCEPTANCE_REQUIRED",
        "URS_TEST_METHOD_REQUIRED",
        "URS_CRITICALITY_REQUIRED"
      ])
    );
  });

  it("requires source_refs for fact-derived URS requirements", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "urs-1",
      documents: [
        {
          id: "urs-1",
          docType: "URS",
          currentContent: JSON.stringify({
            requirements: [
              {
                req_id: "URS-01",
                statement: "System shall hold setpoint.",
                acceptance_criteria: "Pass",
                test_method: "OQ",
                criticality: "MEDIUM",
                fact_derived: true,
                source_refs: []
              }
            ]
          })
        }
      ]
    });

    expect(result.issues.map((item) => item.code)).toContain("URS_FACT_SOURCE_REQUIRED");
  });

  it("enforces RA scoring, controls, links, and verification mappings", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "rid-1",
      documents: [
        {
          id: "rid-1",
          docType: "RID",
          currentContent: JSON.stringify({
            risks: [
              {
                risk_id: "RID-001",
                severity: null,
                occurrence: null,
                detection: null,
                controls: [],
                linked_req_ids: [],
                verification_test_ids: []
              }
            ]
          })
        }
      ]
    });

    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "RA_SCORING_REQUIRED",
        "RA_CONTROLS_REQUIRED",
        "RA_LINKED_REQ_REQUIRED",
        "RA_VERIFICATION_REQUIRED"
      ])
    );
  });

  it("requires at least one RA risk row", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "rid-1",
      documents: [
        {
          id: "rid-1",
          docType: "RID",
          currentContent: JSON.stringify({ risks: [] })
        }
      ]
    });
    expect(result.issues.map((item) => item.code)).toContain("RA_RISKS_MISSING");
  });

  it("enforces IOQ/OQ step and expected result rules", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "ioq-1",
      documents: [
        {
          id: "ioq-1",
          docType: "IOQ",
          currentContent: JSON.stringify({
            test_cases: [
              {
                test_id: "IOQ-001",
                steps: [],
                expected_results: [],
                linked_req_ids: [],
                linked_risk_ids: []
              }
            ]
          })
        }
      ]
    });

    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "TEST_STEPS_REQUIRED",
        "TEST_EXPECTED_RESULTS_REQUIRED",
        "TEST_TRACE_LINK_REQUIRED"
      ])
    );
  });

  it("requires at least one IOQ/OQ test case", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "oq-1",
      documents: [
        {
          id: "oq-1",
          docType: "OQ",
          currentContent: JSON.stringify({ test_cases: [] })
        }
      ]
    });
    expect(result.issues.map((item) => item.code)).toContain("TEST_CASES_MISSING");
  });

  it("requires traceability for critical requirements and high risks", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "rid-1",
      documents: [
        {
          id: "urs-1",
          docType: "URS",
          currentContent: JSON.stringify({
            requirements: [
              {
                req_id: "URS-CRIT-1",
                statement: "System shall alarm.",
                acceptance_criteria: "Alarm shown",
                test_method: "OQ",
                criticality: "HIGH",
                source_refs: ["facts:alarm"]
              }
            ]
          })
        },
        {
          id: "rid-1",
          docType: "RID",
          currentContent: JSON.stringify({
            risks: [
              {
                risk_id: "RISK-1",
                severity: 5,
                occurrence: 3,
                detection: 3,
                initial_risk: 45,
                residual_risk: 15,
                controls: ["Alarm check"],
                linked_req_ids: ["URS-CRIT-1"],
                verification_test_ids: ["OQ-001"]
              }
            ]
          })
        }
      ]
    });

    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(["TRACE_CRITICAL_REQ_UNMAPPED", "TRACE_HIGH_RISK_UNMAPPED"])
    );
  });

  it("enforces terminology glossary consistency", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "urs-1",
      documents: [
        {
          id: "urs-1",
          docType: "URS",
          currentContent: JSON.stringify({
            requirements: [
              {
                req_id: "URS-01",
                statement: "System shall support XYZ alerts.",
                acceptance_criteria: "Pass",
                test_method: "OQ",
                criticality: "LOW",
                source_refs: ["manual p1"]
              }
            ],
            glossary: [{ acronym: "TSX", definition: "model family" }]
          })
        }
      ]
    });

    expect(result.issues.map((item) => item.code)).toContain("TERMINOLOGY_UNDEFINED_ACRONYM");
  });
});
