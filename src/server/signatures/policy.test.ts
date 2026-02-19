import { describe, expect, it } from "vitest";
import { evaluateSignaturePolicy } from "@/server/signatures/policy";

describe("signature policy matrix", () => {
  it("allows AUTHOR signature only for author roles in draft/in-review", () => {
    expect(evaluateSignaturePolicy({ role: "USER", meaning: "AUTHOR", recordState: "DRAFT" }).allowed).toBe(true);
    expect(evaluateSignaturePolicy({ role: "AUTHOR", meaning: "AUTHOR", recordState: "DRAFT" }).allowed).toBe(true);
    expect(evaluateSignaturePolicy({ role: "ENGINEER", meaning: "AUTHOR", recordState: "IN_REVIEW" }).allowed).toBe(true);
    expect(evaluateSignaturePolicy({ role: "VIEWER", meaning: "AUTHOR", recordState: "DRAFT" }).allowed).toBe(false);
    expect(evaluateSignaturePolicy({ role: "AUTHOR", meaning: "AUTHOR", recordState: "APPROVED" }).allowed).toBe(false);
  });

  it("allows REVIEW signature only for approver roles and in-review state", () => {
    expect(evaluateSignaturePolicy({ role: "REVIEWER", meaning: "REVIEW", recordState: "IN_REVIEW" }).allowed).toBe(true);
    expect(evaluateSignaturePolicy({ role: "APPROVER", meaning: "REVIEW", recordState: "IN_REVIEW" }).allowed).toBe(true);
    expect(evaluateSignaturePolicy({ role: "ADMIN", meaning: "REVIEW", recordState: "IN_REVIEW" }).allowed).toBe(true);
    expect(evaluateSignaturePolicy({ role: "USER", meaning: "REVIEW", recordState: "IN_REVIEW" }).allowed).toBe(false);
    expect(evaluateSignaturePolicy({ role: "REVIEWER", meaning: "REVIEW", recordState: "DRAFT" }).allowed).toBe(false);
  });

  it("allows APPROVE signature only for approver roles and in-review state", () => {
    expect(evaluateSignaturePolicy({ role: "APPROVER", meaning: "APPROVE", recordState: "IN_REVIEW" }).allowed).toBe(true);
    expect(evaluateSignaturePolicy({ role: "ADMIN", meaning: "APPROVE", recordState: "IN_REVIEW" }).allowed).toBe(true);
    expect(evaluateSignaturePolicy({ role: "REVIEWER", meaning: "APPROVE", recordState: "IN_REVIEW" }).allowed).toBe(false);
    expect(evaluateSignaturePolicy({ role: "USER", meaning: "APPROVE", recordState: "IN_REVIEW" }).allowed).toBe(false);
    expect(evaluateSignaturePolicy({ role: "APPROVER", meaning: "APPROVE", recordState: "DRAFT" }).allowed).toBe(false);
  });
});
