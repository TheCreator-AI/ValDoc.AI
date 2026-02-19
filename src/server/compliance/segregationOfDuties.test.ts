import { afterEach, describe, expect, it } from "vitest";
import { evaluateApprovalSegregation } from "@/server/compliance/segregationOfDuties";

const originalEnforce = process.env.ENFORCE_TWO_PERSON_RULE;
const originalOverride = process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED;

describe("segregation of duties", () => {
  afterEach(() => {
    process.env.ENFORCE_TWO_PERSON_RULE = originalEnforce;
    process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED = originalOverride;
  });

  it("denies same-user final approval when two-person rule is enforced", () => {
    process.env.ENFORCE_TWO_PERSON_RULE = "true";
    process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED = "false";

    const result = evaluateApprovalSegregation({
      actorRole: "REVIEWER",
      actorUserId: "u1",
      authorUserId: "u1"
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("two_person_rule_violation");
  });

  it("allows same-user final approval when two-person rule is disabled", () => {
    process.env.ENFORCE_TWO_PERSON_RULE = "false";
    process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED = "false";

    const result = evaluateApprovalSegregation({
      actorRole: "REVIEWER",
      actorUserId: "u1",
      authorUserId: "u1"
    });

    expect(result.allowed).toBe(true);
  });

  it("allows admin emergency override with explicit justification", () => {
    process.env.ENFORCE_TWO_PERSON_RULE = "true";
    process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED = "true";

    const result = evaluateApprovalSegregation({
      actorRole: "ADMIN",
      actorUserId: "u1",
      authorUserId: "u1",
      emergencyOverride: true,
      overrideJustification: "Batch release timeline risk; temporary emergency approval."
    });

    expect(result.allowed).toBe(true);
    expect(result.overrideUsed).toBe(true);
  });
});
