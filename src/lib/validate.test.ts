import { describe, it, expect } from "vitest";
import { validateDocument } from "./validate";

describe("validateDocument", () => {
  it("flags missing required sections", () => {
    const text = "# Title\n\nThis is a short document.";
    const report = validateDocument(text);

    expect(report.status).toBe("fail");
    const missing = report.issues.filter((i) => i.id === "missing-section");
    expect(missing.length).toBeGreaterThan(0);
  });

  it("passes when required sections are present and length is sufficient", () => {
    const text = `# Title

## Summary
This is a summary.

## Scope
This covers system behavior.

## Risks
- Risk A

## Data Sources
Internal logs.

## Appendix
${"word ".repeat(220)}`;

    const report = validateDocument(text);
    expect(report.status).toBe("pass");
    expect(report.issues.length).toBe(0);
  });

  it("treats TODO as error in strict mode", () => {
    const text = `# Title

## Summary
TODO

## Scope
Details.

## Risks
None.

## Data Sources
Internal.

${"word ".repeat(220)}`;

    const report = validateDocument(text, { strict: true });
    const todo = report.issues.find((i) => i.id === "placeholder");

    expect(todo?.severity).toBe("error");
    expect(report.status).toBe("fail");
  });
});
