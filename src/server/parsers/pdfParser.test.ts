import { describe, expect, it } from "vitest";
import { parseSourceDocument } from "@/server/parsers/pdfParser";

describe("parseSourceDocument", () => {
  it("parses plain text and emits chunks with citation metadata", async () => {
    const buffer = Buffer.from("Intended use: sterile filtration\nTemperature 2 to 8 C\nSafety interlock present");
    const parsed = await parseSourceDocument(buffer, "text/plain");

    expect(parsed.fullText).toContain("Intended use");
    expect(parsed.chunks.length).toBeGreaterThan(0);
    expect(parsed.chunks[0]?.page).toBe(1);
    expect(parsed.chunks[0]?.section).toContain("Section");
  });
});
