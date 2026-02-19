import type { ReviewStatus, Role, SignatureMeaning } from "@prisma/client";

export type SignaturePolicyInput = {
  role: Role;
  meaning: SignatureMeaning;
  recordState: ReviewStatus;
};

export type SignaturePolicyResult = {
  allowed: boolean;
  reason?: string;
};

const hasApproverRole = (role: Role) => role === "APPROVER" || role === "ADMIN";
const hasReviewerRole = (role: Role) => role === "REVIEWER" || hasApproverRole(role);
const hasAuthorRole = (role: Role) => role === "USER" || role === "AUTHOR" || role === "ENGINEER" || role === "ADMIN";

export const evaluateSignaturePolicy = (input: SignaturePolicyInput): SignaturePolicyResult => {
  const { role, meaning, recordState } = input;

  if (meaning === "AUTHOR") {
    if (!hasAuthorRole(role)) return { allowed: false, reason: "author_role_required" };
    if (recordState !== "DRAFT" && recordState !== "IN_REVIEW") {
      return { allowed: false, reason: "author_signature_requires_draft_or_in_review" };
    }
    return { allowed: true };
  }

  if (meaning === "REVIEW") {
    if (!hasReviewerRole(role)) return { allowed: false, reason: "reviewer_role_required" };
    if (recordState !== "IN_REVIEW") return { allowed: false, reason: "review_signature_requires_in_review" };
    return { allowed: true };
  }

  if (!hasApproverRole(role)) return { allowed: false, reason: "approver_role_required" };
  if (recordState !== "IN_REVIEW") return { allowed: false, reason: "approve_signature_requires_in_review" };
  return { allowed: true };
};
