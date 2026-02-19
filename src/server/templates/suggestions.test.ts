import { describe, expect, it } from "vitest";
import { DocType } from "@prisma/client";
import { buildTemplateSuggestions } from "@/server/templates/suggestions";

describe("buildTemplateSuggestions", () => {
  it("returns two non-empty suggestions with core sections", () => {
    const suggestions = buildTemplateSuggestions({
      docType: DocType.DIA,
      samples: [
        "# DIA\n\n## Purpose\n\n## Glossary\n\n## Data Integrity Requirements\n\n## Revision History",
        "# DIA 2\n\n## Purpose\n\n## System Description\n\n## Appendices"
      ]
    });

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].contentTemplate).toContain("## Purpose");
    expect(suggestions[0].contentTemplate).toContain("## Citations");
    expect(suggestions[1].contentTemplate).toContain("## Scope");
    expect(suggestions[1].contentTemplate).toContain("## Assumptions and Open Items");
  });
});
