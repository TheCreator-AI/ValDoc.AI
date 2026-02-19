import { describe, expect, it } from "vitest";
import { validateDocumentPayload } from "@/server/schemas/validator";

const metadata = {
  system_name: "TSX2320FA20 Freezer",
  equipment_id: "EQ-TSX-01",
  generated_at: "2026-02-17T12:00:00.000Z",
  generated_by: "andrew@qa.org"
};

describe("validation document schemas", () => {
  it("accepts valid URS payload and rejects invalid URS payload", () => {
    const validPayload = {
      metadata: { ...metadata, doc_type: "URS", doc_version: "v1" },
      revision_history: [
        {
          version: "v1.0",
          changed_at: "2026-02-17T12:00:00.000Z",
          changed_by: "andrew@qa.org",
          change_summary: "Initial draft"
        }
      ],
      requirements: [
        {
          req_id: "URS-001",
          category: "Temperature Control",
          statement: "The freezer shall maintain -20C +/- 2C.",
          rationale: "Protects product quality.",
          source_refs: ["manual:section-3.2"],
          acceptance_criteria: "Temperature logger remains in range for 24 hours.",
          test_method: "OQ",
          criticality: "HIGH",
          linked_risk_ids: ["RA-001"]
        }
      ]
    };

    const invalidPayload = {
      metadata: { ...metadata, doc_type: "URS", doc_version: "v1" },
      revision_history: [],
      requirements: [
        {
          req_id: "URS-001",
          category: "Temperature Control",
          statement: "Maintain range"
        }
      ]
    };

    const validResult = validateDocumentPayload("urs.v1", validPayload);
    expect(validResult.valid).toBe(true);

    const invalidResult = validateDocumentPayload("urs.v1", invalidPayload);
    expect(invalidResult.valid).toBe(false);
  });

  it("accepts valid RA payload and rejects invalid RA payload", () => {
    const validPayload = {
      metadata: { ...metadata, doc_type: "RA", doc_version: "v1" },
      revision_history: [],
      risks: [
        {
          risk_id: "RA-001",
          hazard: "Temperature deviation",
          cause: "Sensor failure",
          impact: "Product degradation",
          severity: 4,
          occurrence: 2,
          detection: 2,
          initial_risk: 16,
          controls: ["Dual sensors", "Alarm escalation"],
          residual_risk: 6,
          linked_req_ids: ["URS-001"],
          verification_test_ids: ["OQ-001"]
        }
      ]
    };

    const invalidPayload = {
      metadata: { ...metadata, doc_type: "RA", doc_version: "v1" },
      revision_history: [],
      risks: [
        {
          risk_id: "RA-001",
          hazard: "Temperature deviation"
        }
      ]
    };

    expect(validateDocumentPayload("ra.v1", validPayload).valid).toBe(true);
    expect(validateDocumentPayload("ra.v1", invalidPayload).valid).toBe(false);
  });

  it("accepts valid IOQ and OQ payloads", () => {
    const ioqPayload = {
      metadata: { ...metadata, doc_type: "IOQ", doc_version: "v1" },
      revision_history: [],
      test_cases: [
        {
          test_id: "IOQ-001",
          objective: "Verify installation",
          prerequisites: ["Power available"],
          steps: ["Inspect nameplate", "Verify power cable"],
          expected_results: ["Correct model number", "No cable damage"],
          evidence_required: "Photographic evidence",
          pass_fail: "PASS",
          linked_req_ids: ["URS-001"],
          linked_risk_ids: ["RA-001"]
        }
      ]
    };
    const oqPayload = {
      metadata: { ...metadata, doc_type: "OQ", doc_version: "v1" },
      revision_history: [],
      test_cases: [
        {
          test_id: "OQ-001",
          objective: "Verify operational temperature control",
          prerequisites: ["Calibrated probe available"],
          steps: ["Start compressor", "Record temperature 2 hours"],
          expected_results: ["Stable setpoint"],
          evidence_required: "Trend report",
          pass_fail: "PENDING",
          linked_req_ids: ["URS-001"],
          linked_risk_ids: ["RA-001"]
        }
      ]
    };

    expect(validateDocumentPayload("ioq.v1", ioqPayload).valid).toBe(true);
    expect(validateDocumentPayload("oq.v1", oqPayload).valid).toBe(true);
  });

  it("accepts valid TM payload and rejects invalid TM payload", () => {
    const validPayload = {
      metadata: { ...metadata, doc_type: "TM", doc_version: "v1" },
      revision_history: [],
      mappings: [
        {
          req_id: "URS-001",
          risk_ids: ["RA-001"],
          test_ids: ["IOQ-001", "OQ-001"],
          output_reference: {
            template_doc_type: "IOQ",
            output_document_ref: "JOB-001/IOQ",
            output_section_ref: "Section 4.1"
          }
        }
      ]
    };

    const invalidPayload = {
      metadata: { ...metadata, doc_type: "TM", doc_version: "v1" },
      revision_history: [],
      mappings: [
        {
          req_id: "URS-001",
          risk_ids: []
        }
      ]
    };

    expect(validateDocumentPayload("tm.v1", validPayload).valid).toBe(true);
    expect(validateDocumentPayload("tm.v1", invalidPayload).valid).toBe(false);
  });
});
