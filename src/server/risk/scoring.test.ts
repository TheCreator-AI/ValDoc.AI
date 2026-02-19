import { describe, expect, it } from "vitest";
import { computeInitialRisk, computeResidualRisk } from "@/server/risk/scoring";

describe("risk scoring", () => {
  it("computes initial risk deterministically using configured formula", () => {
    expect(computeInitialRisk({ severity: 5, occurrence: 3, detection: 2 })).toBe(30);
    expect(computeInitialRisk({ severity: 2, occurrence: 2, detection: 2 })).toBe(8);
  });

  it("computes residual risk lower than initial when controls are effective", () => {
    const initial = computeInitialRisk({ severity: 4, occurrence: 3, detection: 3 });
    const residual = computeResidualRisk({
      initialRisk: initial,
      controlEffectiveness: [0.3, 0.2]
    });
    expect(residual).toBeLessThan(initial);
  });
});
