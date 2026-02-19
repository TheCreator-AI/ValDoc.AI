import { DocType } from "@prisma/client";

export type TemplateSuggestion = {
  title: string;
  contentTemplate: string;
  sourceCount: number;
};

const headingPattern = /^##\s+(.+)$/gm;

const fallbackByDocType: Record<DocType, string[]> = {
  URS: ["Purpose and Scope", "Requirements", "Responsibilities", "References"],
  SIA: ["Purpose", "System Overview", "Impact Assessment", "References"],
  RID: ["Purpose", "Requirement Impact", "Risk and Controls", "References"],
  DIA: ["Purpose", "Glossary", "System Description", "Data Integrity Requirements", "Revision History", "Appendices"],
  IOQ: ["Purpose", "Prerequisites", "Installation Checks", "Operational Checks", "Acceptance Criteria"],
  OQ: ["Purpose", "Prerequisites", "Operational Challenges", "Expected Results", "Acceptance Criteria"],
  EXECUTED_PROTOCOL: ["Execution Record", "Results", "Deviations", "Evidence Index"],
  PROTOCOL_SUMMARY: ["Purpose", "Execution Summary", "Outstanding Actions", "Conclusion"],
  SUMMARY: ["Scope", "Qualification Summary", "Compliance Assessment", "Release Recommendation"],
  TRACEABILITY: ["Requirement to Risk to Test Mapping", "Matrix Rows", "References"]
};

const extractHeadings = (content: string) => {
  const headings: string[] = [];
  for (const match of content.matchAll(headingPattern)) {
    const heading = match[1]?.trim();
    if (heading) headings.push(heading);
  }
  return headings;
};

const uniqueOrdered = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildTemplateSuggestions = (params: {
  docType: DocType;
  samples: string[];
}): TemplateSuggestion[] => {
  const { docType, samples } = params;
  const allHeadings = samples.flatMap(extractHeadings);
  const fallbackHeadings = fallbackByDocType[docType];
  const merged = uniqueOrdered([...allHeadings, ...fallbackHeadings]).slice(0, 8);

  const sectionsVariantA = merged;
  const sectionsVariantB = uniqueOrdered([
    merged[0] ?? "Purpose",
    "Scope",
    ...merged.filter((section) => section !== "Scope").slice(1),
    "Assumptions and Open Items"
  ]).slice(0, 9);

  const asTemplate = (title: string, sections: string[]) => {
    const body = sections.map((section) => `## ${section}\n`).join("\n");
    return `# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n${body}\n## Citations\n{{CITATIONS}}`;
  };

  return [
    {
      title: `${docType} Suggested Template A`,
      contentTemplate: asTemplate(`${docType} Suggested Template A`, sectionsVariantA),
      sourceCount: samples.length
    },
    {
      title: `${docType} Suggested Template B`,
      contentTemplate: asTemplate(`${docType} Suggested Template B`, sectionsVariantB),
      sourceCount: samples.length
    }
  ];
};
