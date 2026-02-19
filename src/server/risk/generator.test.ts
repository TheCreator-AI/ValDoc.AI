import { describe, expect, it } from "vitest";
import { generateRaPayloadFromUrs } from "@/server/risk/generator";

describe("RA generator", () => {
  it("generates deterministic RA payload from URS requirements", () => {
    const ursRequirements = [
      {
        req_id: "URS-001",
        category: "Data Integrity",
        statement: "The system shall enforce unique user credentials.",
        test_method: "Doc Review",
        criticality: "HIGH"
      },
      {
        req_id: "URS-002",
        category: "Temperature Control",
        statement: "The system shall maintain 2-8 C.",
        test_method: "OQ",
        criticality: "MEDIUM"
      }
    ];

    const ra = generateRaPayloadFromUrs({
      systemName: "TSX2320FA20",
      equipmentId: "EQ-TSX-01",
      generatedBy: "andrew@qa.org",
      requirements: ursRequirements
    });

    expect(ra.metadata.doc_type).toBe("RA");
    expect(ra.risks).toHaveLength(2);
    expect(ra.risks[0].linked_req_ids).toContain("URS-001");
    expect(ra.risks[0].controls[0]).toMatch(/\(Doc Review\)|\(IQ\)|\(OQ\)/);
  });
});
