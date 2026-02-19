import { describe, expect, it } from "vitest";
import { evaluateDocumentQualityGate } from "@/server/quality/documentQualityGate";

describe("document quality gate", () => {
  it("fails URS checks when required fields are missing", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "doc-urs",
      documents: [
        {
          id: "doc-urs",
          docType: "URS",
          currentContent: JSON.stringify({
            metadata: { doc_type: "URS" },
            requirements: [
              {
                req_id: "",
                statement: "Temperature control is required.",
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

  it("fails traceability when critical requirements and high risks are unmapped", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "doc-rid",
      documents: [
        {
          id: "doc-urs",
          docType: "URS",
          currentContent: JSON.stringify({
            requirements: [
              {
                req_id: "URS-001",
                statement: "System shall hold setpoint.",
                acceptance_criteria: "Within range",
                test_method: "OQ",
                criticality: "HIGH",
                source_refs: ["manual"]
              }
            ],
            glossary: [{ acronym: "SOP", definition: "standard operating procedure" }]
          })
        },
        {
          id: "doc-rid",
          docType: "RID",
          currentContent: JSON.stringify({
            risks: [
              {
                risk_id: "RA-001",
                severity: 5,
                occurrence: 4,
                detection: 3,
                initial_risk: 60,
                controls: ["Audit trail"],
                linked_req_ids: ["URS-001"],
                verification_test_ids: ["OQ-001"]
              }
            ]
          })
        }
      ],
      traceLinks: []
    });

    expect(result.ready).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(["TRACE_CRITICAL_REQ_UNMAPPED", "TRACE_HIGH_RISK_UNMAPPED"])
    );
  });

  it("passes for compliant URS/RA/IOQ/OQ package with glossary", () => {
    const result = evaluateDocumentQualityGate({
      targetDocumentId: "doc-oq",
      documents: [
        {
          id: "doc-urs",
          docType: "URS",
          currentContent: JSON.stringify({
            requirements: [
              {
                req_id: "URS-001",
                statement: "System shall maintain -20C.",
                acceptance_criteria: "Setpoint maintained",
                test_method: "OQ",
                criticality: "HIGH",
                source_refs: ["fact:temperature_setpoint"]
              }
            ],
            glossary: [{ acronym: "TSX", definition: "Freezer model family" }]
          })
        },
        {
          id: "doc-rid",
          docType: "RID",
          currentContent: JSON.stringify({
            risks: [
              {
                risk_id: "RA-001",
                severity: 4,
                occurrence: 2,
                detection: 2,
                initial_risk: 16,
                controls: ["Alarm verification"],
                linked_req_ids: ["URS-001"],
                verification_test_ids: ["OQ-001"]
              }
            ],
            glossary: [{ acronym: "TSX", definition: "Freezer model family" }]
          })
        },
        {
          id: "doc-ioq",
          docType: "IOQ",
          currentContent: JSON.stringify({
            test_cases: [
              {
                test_id: "IOQ-001",
                steps: ["Inspect install"],
                expected_results: ["Installed correctly"],
                linked_req_ids: ["URS-001"],
                linked_risk_ids: ["RA-001"]
              }
            ],
            glossary: [{ acronym: "TSX", definition: "Freezer model family" }]
          })
        },
        {
          id: "doc-oq",
          docType: "OQ",
          currentContent: JSON.stringify({
            test_cases: [
              {
                test_id: "OQ-001",
                steps: ["Challenge temperature"],
                expected_results: ["Meets criteria"],
                linked_req_ids: ["URS-001"],
                linked_risk_ids: ["RA-001"]
              }
            ],
            glossary: [{ acronym: "TSX", definition: "Freezer model family" }]
          })
        }
      ]
    });

    expect(result.ready).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

