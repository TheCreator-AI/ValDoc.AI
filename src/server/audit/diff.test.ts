import { describe, expect, it } from "vitest";
import { diffJsonContent } from "@/server/audit/diff";

describe("diffJsonContent", () => {
  it("captures changed nested requirement fields with paths", () => {
    const oldContent = JSON.stringify({
      requirements: [
        { req_id: "URS-001", acceptance_criteria: "A" },
        { req_id: "URS-002", acceptance_criteria: "B" },
        { req_id: "URS-003", acceptance_criteria: "C" },
        { req_id: "URS-004", acceptance_criteria: "D" }
      ]
    });
    const newContent = JSON.stringify({
      requirements: [
        { req_id: "URS-001", acceptance_criteria: "A" },
        { req_id: "URS-002", acceptance_criteria: "B" },
        { req_id: "URS-003", acceptance_criteria: "C" },
        { req_id: "URS-004", acceptance_criteria: "Updated" }
      ]
    });

    const changes = diffJsonContent(oldContent, newContent);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changePath: "requirements[3].acceptance_criteria",
          oldValue: "D",
          newValue: "Updated"
        })
      ])
    );
  });

  it("captures test result field changes", () => {
    const oldContent = JSON.stringify({
      test_cases: [{ test_id: "OQ-001", pass_fail: "PENDING" }]
    });
    const newContent = JSON.stringify({
      test_cases: [{ test_id: "OQ-001", pass_fail: "PASS" }]
    });

    const changes = diffJsonContent(oldContent, newContent);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changePath: "test_cases[0].pass_fail",
          oldValue: "PENDING",
          newValue: "PASS"
        })
      ])
    );
  });
});
