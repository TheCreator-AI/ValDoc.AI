import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageDir = path.join(root, "validation-package");

const mustExist = [
  "01-system-urs.md",
  "02-system-risk-assessment.md",
  "03-validation-plan.md",
  "04-iq-protocol.md",
  "05-oq-protocol.md",
  "06-traceability-matrix.csv",
  "07-validation-summary-report-template.md"
];

describe("validation package artifacts", () => {
  it("contains all required software validation package documents", () => {
    for (const file of mustExist) {
      const fullPath = path.join(packageDir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, "utf-8");
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  it("references implemented compliance controls", () => {
    const urs = fs.readFileSync(path.join(packageDir, "01-system-urs.md"), "utf-8");
    const ra = fs.readFileSync(path.join(packageDir, "02-system-risk-assessment.md"), "utf-8");
    const tm = fs.readFileSync(path.join(packageDir, "06-traceability-matrix.csv"), "utf-8");

    expect(urs).toContain("role-based access controls");
    expect(urs).toContain("E-Signatures");
    expect(ra).toContain("audit");
    expect(tm).toContain("hash");
    expect(tm).toContain("backup");
  });
});
