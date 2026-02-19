import { describe, expect, it } from "vitest";
import { buildPipelineArtifacts } from "@/server/pipeline/generator";

describe("pipeline artifact generation", () => {
  const baseInput = {
    systemName: "TSX Freezer",
    equipmentId: "TSX2320FA20",
    generatedBy: "andrew@qa.org",
    generatedAt: "2026-02-17T12:00:00.000Z",
    intendedUse: "Store temperature sensitive materials at controlled setpoint.",
    facts: [
      { factType: "RANGE", key: "temperature_setpoint", value: "-20", units: "C", sourceRef: "FACT:temperature_setpoint" },
      { factType: "UTILITY", key: "line_voltage", value: "120", units: "V", sourceRef: "FACT:line_voltage" },
      { factType: "SAFETY", key: "high_temp_alarm", value: "Enabled", units: null, sourceRef: "FACT:high_temp_alarm" }
    ]
  };

  it("generates deterministic artifacts for same input", () => {
    const first = buildPipelineArtifacts(baseInput);
    const second = buildPipelineArtifacts(baseInput);
    expect(first).toEqual(second);
    expect(first).toMatchSnapshot();
  });
});
