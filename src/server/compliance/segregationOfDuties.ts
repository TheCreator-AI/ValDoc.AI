import type { Role } from "@prisma/client";

const toBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
};

export const isTwoPersonRuleEnforced = () => toBoolean(process.env.ENFORCE_TWO_PERSON_RULE, true);
export const isEmergencyApprovalOverrideEnabled = () =>
  toBoolean(process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED, false);

type ApprovalSegregationInput = {
  actorRole: Role;
  actorUserId: string;
  authorUserId: string;
  emergencyOverride?: boolean;
  overrideJustification?: string;
};

type ApprovalSegregationResult = {
  allowed: boolean;
  overrideUsed?: boolean;
  reason?: string;
  remediation?: string;
  normalizedJustification?: string;
};

export const evaluateApprovalSegregation = (
  input: ApprovalSegregationInput
): ApprovalSegregationResult => {
  if (!isTwoPersonRuleEnforced()) {
    return { allowed: true };
  }

  if (input.actorUserId !== input.authorUserId) {
    return { allowed: true };
  }

  const remediation =
    "Remediation: assign approval to a different Reviewer/Admin, or use admin emergency override with documented justification.";

  if (input.actorRole !== "ADMIN") {
    return {
      allowed: false,
      reason: "two_person_rule_violation",
      remediation
    };
  }

  if (!isEmergencyApprovalOverrideEnabled()) {
    return {
      allowed: false,
      reason: "two_person_rule_violation_override_disabled",
      remediation
    };
  }

  if (!input.emergencyOverride) {
    return {
      allowed: false,
      reason: "two_person_rule_violation_override_not_requested",
      remediation
    };
  }

  const justification = input.overrideJustification?.trim();
  if (!justification) {
    return {
      allowed: false,
      reason: "override_justification_required",
      remediation
    };
  }

  return {
    allowed: true,
    overrideUsed: true,
    normalizedJustification: justification
  };
};
