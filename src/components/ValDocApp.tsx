"use client";

import { useState } from "react";
import type { ValidationReport } from "@/lib/validate";
import styles from "./ValDocApp.module.css";

const sampleText = `# Title

## Summary
Summarize the document purpose here.

## Scope
Describe what is in scope and out of scope.

## Risks
- Risk A
- Risk B

## Data Sources
List primary data sources.

${"word ".repeat(220)}`;

export default function ValDocApp() {
  const [text, setText] = useState("");
  const [strict, setStrict] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, options: { strict } })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Validation failed.");
      }

      const payload = (await response.json()) as ValidationReport;
      setReport(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error.";
      setError(message);
      setReport(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.tag}>ValDoc.AI</p>
          <h1 className={styles.title}>Validate product and policy docs before they go live.</h1>
          <p className={styles.subtitle}>
            Paste a draft, run a baseline or strict check, and get a concise report with
            missing sections, length issues, and placeholder warnings.
          </p>
        </header>

        <section className={styles.card}>
          <div className={styles.stack}>
            <label htmlFor="document" className={styles.label}>
              Document text
            </label>
            <textarea
              id="document"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste your draft here..."
              rows={12}
              className={styles.textarea}
            />
            <div className={styles.controls}>
              <button
                type="button"
                onClick={() => setText(sampleText)}
                className={styles.button}
              >
                Load sample
              </button>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={strict}
                  onChange={(event) => setStrict(event.target.checked)}
                />
                Strict mode
              </label>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || text.trim().length === 0}
            className={styles.submit}
          >
            {isSubmitting ? "Validating..." : "Validate"}
          </button>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>

        <section className={styles.card}>
          <h2 className={styles.reportHeader}>Validation report</h2>
          {!report ? (
            <p className={styles.reportSummary}>
              Run a validation to see score, status, and recommended fixes.
            </p>
          ) : (
            <div className={styles.reportGrid}>
              <div className={styles.badges}>
                <span className={styles.badge}>
                  Status: {report.status}
                </span>
                <span className={`${styles.badge} ${styles.scoreBadge}`}>
                  Score: {report.score}
                </span>
                <span className={styles.reportSummary}>{report.summary}</span>
              </div>

              <div className={styles.stackSmall}>
                <p className={styles.meta}>Issues</p>
                {report.issues.length === 0 ? (
                  <p className={styles.reportSummary}>No issues found.</p>
                ) : (
                  <ul className={styles.issueList}>
                    {report.issues.map((issue, index) => (
                      <li
                        key={`${issue.id}-${index}`}
                        className={styles.issueItem}
                      >
                        <p className={styles.issueTitle}>
                          {issue.severity.toUpperCase()}: {issue.message}
                        </p>
                        {issue.suggestion ? (
                          <p className={styles.issueSuggestion}>{issue.suggestion}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={styles.meta}>
                <p>Word count: {report.stats.wordCount}</p>
                <p>Missing sections: {report.stats.missingSections.join(", ") || "None"}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
