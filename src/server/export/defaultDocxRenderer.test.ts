import { describe, expect, it } from "vitest";
import { buildDocxExportModel, renderDefaultDocx } from "@/server/export/defaultDocxRenderer";

describe("default DOCX renderer", () => {
  it("builds required sections, traceability references, and footer metadata", async () => {
    const payload = {
      metadata: {
        doc_type: "URS",
        doc_version: "v1",
        system_name: "TSX2320FA20",
        equipment_id: "TSX-2320",
        generated_at: "2026-02-17T15:20:00.000Z",
        generated_by: "andrew@qa.org"
      },
      revision_history: [
        {
          version: "v1",
          changed_at: "2026-02-17T15:20:00.000Z",
          changed_by: "andrew@qa.org",
          change_summary: "Initial draft"
        }
      ],
      approvals: [{ role: "Engineer", name: "A. Herman", date: "2026-02-17", signature_status: "PENDING" }],
      signatures: [],
      requirements: [
        {
          req_id: "URS-001",
          category: "Temperature",
          statement: "The freezer shall maintain setpoint.",
          rationale: "Product quality",
          source_refs: ["Manual p.22"],
          acceptance_criteria: "Within +/- 10%",
          test_method: "OQ",
          criticality: "HIGH",
          linked_risk_ids: ["RA-001"]
        }
      ],
      risks: [
        {
          risk_id: "RA-001",
          verification_test_ids: ["OQ-001"]
        }
      ]
    };

    const model = buildDocxExportModel({
      docType: "URS",
      docId: "doc_123",
      hash: "abc123hash",
      payload,
      generatedAtIso: "2026-02-17T15:30:00.000Z"
    });

    expect(model.sectionHeadings).toEqual(
      expect.arrayContaining([
        "Purpose",
        "Revision History",
        "Approvals and Signatures",
        "Traceability References",
        "Signature Page"
      ])
    );
    expect(model.traceabilityRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirementId: "URS-001",
          riskControlId: "RA-001",
          testCaseId: "OQ-001"
        })
      ])
    );
    expect(model.footerText).toContain("doc_123");
    expect(model.footerText).toContain("abc123hash");
    expect(model.footerText).toContain("2026-02-17T15:30:00.000Z");

    const rendered = await renderDefaultDocx({
      docType: "URS",
      title: "URS Export",
      docId: "doc_123",
      hash: "abc123hash",
      payload
    });

    expect(rendered.model.sectionHeadings).toEqual(
      expect.arrayContaining(["Purpose", "Traceability References", "Signature Page"])
    );
    expect(rendered.buffer.byteLength).toBeGreaterThan(0);
  });

  it("includes primary document content and appends compliance content", async () => {
    const payload = {
      metadata: {
        doc_type: "SUMMARY",
        doc_version: "v1",
        system_name: "TSX2320FA20",
        equipment_id: "TSX-2320",
        generated_at: "2026-02-17T15:20:00.000Z",
        generated_by: "andrew@qa.org"
      },
      revision_history: [],
      approvals: [],
      signatures: []
    };

    const rendered = await renderDefaultDocx({
      docType: "SUMMARY",
      title: "Protocol Summary",
      docId: "doc_456",
      hash: "def456hash",
      payload,
      primaryContent: "Execution Summary\nAll checks passed."
    });

    expect(rendered.model.primaryContentLineCount).toBe(2);
    expect(rendered.model.sectionHeadings).toContain("Traceability References");
    expect(rendered.model.sectionHeadings).toContain("Signature Page");
    expect(rendered.buffer.byteLength).toBeGreaterThan(0);
  });
});
