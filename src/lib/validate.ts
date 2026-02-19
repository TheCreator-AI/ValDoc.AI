export type ValidationIssue = {
  id: "missing-section" | "placeholder" | "length";
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
};

export type ValidationStats = {
  wordCount: number;
  requiredSections: string[];
  missingSections: string[];
};

export type ValidationReport = {
  score: number;
  status: "pass" | "needs_review" | "fail";
  summary: string;
  issues: ValidationIssue[];
  stats: ValidationStats;
};

export type ValidationOptions = {
  strict?: boolean;
  requiredSections?: string[];
  minWords?: number;
};

const DEFAULT_SECTIONS = ["Title", "Summary", "Scope", "Risks", "Data Sources"];
const PLACEHOLDER_PATTERN = /\b(TODO|TBD)\b/i;

const countWords = (text: string) => {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
};

const hasSection = (text: string, section: string) => {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`(^|\\n)\\s*(#{1,6}\\s*)?${escaped}\\b`, "i");
  const labeled = new RegExp(`(^|\\n)\\s*${escaped}\\s*:`, "i");
  return heading.test(text) || labeled.test(text);
};

export const validateDocument = (text: string, options: ValidationOptions = {}): ValidationReport => {
  const strict = options.strict ?? false;
  const requiredSections = options.requiredSections ?? DEFAULT_SECTIONS;
  const minWords = options.minWords ?? (strict ? 300 : 200);

  const issues: ValidationIssue[] = [];
  const wordCount = countWords(text);

  const missingSections = requiredSections.filter((section) => !hasSection(text, section));
  if (missingSections.length > 0) {
    issues.push({
      id: "missing-section",
      severity: "error",
      message: `Missing required sections: ${missingSections.join(", ")}.`,
      suggestion: "Add the missing sections using clear headings."
    });
  }

  if (PLACEHOLDER_PATTERN.test(text)) {
    issues.push({
      id: "placeholder",
      severity: strict ? "error" : "warning",
      message: "Document contains placeholder text like TODO or TBD.",
      suggestion: "Replace placeholders with finalized content."
    });
  }

  if (wordCount < minWords) {
    issues.push({
      id: "length",
      severity: strict ? "error" : "warning",
      message: `Document is too short (${wordCount} words).`,
      suggestion: `Target at least ${minWords} words for completeness.`
    });
  }

  const scoreFloor = strict ? 30 : 40;
  const scorePenalty = issues.reduce((total, issue) => {
    if (issue.severity === "error") return total + 20;
    return total + 10;
  }, 0);
  const score = Math.max(scoreFloor, 100 - scorePenalty);

  let status: ValidationReport["status"] = "pass";
  if (issues.some((issue) => issue.severity === "error")) {
    status = "fail";
  } else if (issues.length > 0) {
    status = "needs_review";
  }

  const summary =
    status === "pass"
      ? "Document meets baseline validation requirements."
      : status === "needs_review"
        ? "Document is close but needs improvements."
        : "Document fails validation and needs revisions.";

  return {
    score,
    status,
    summary,
    issues,
    stats: {
      wordCount,
      requiredSections,
      missingSections
    }
  };
};
