import { describe, expect, it } from "vitest";
import { extractFactModel } from "@/server/extract/factModel";

describe("extractFactModel", () => {
  it("extracts range and keywords from source chunks", () => {
    const result = extractFactModel("source-1", [
      { page: 1, section: "Section 1", text: "Intended use is sterile cell culture" },
      { page: 1, section: "Section 2", text: "Temperature 2 to 8 C with pressure sensor and OPC interface" },
      { page: 2, section: "Section 1", text: "Emergency alarm interlock" }
    ]);

    expect(result.intendedUse).toContain("Intended use");
    expect(result.sensors).toContain("temperature");
    expect(result.dataInterfaces).toContain("opc");
    expect(result.processRanges[0]).toEqual({
      parameter: "Temperature",
      min: 2,
      max: 8,
      units: "C"
    });
    expect(result.citations.length).toBe(3);
  });

  it("extracts ranges when source uses en dash separator", () => {
    const result = extractFactModel("source-2", [
      { page: 1, section: "Section 1", text: "Temperature 2 \u2013 8 C" }
    ]);

    expect(result.processRanges[0]).toEqual({
      parameter: "Temperature",
      min: 2,
      max: 8,
      units: "C"
    });
  });
});
