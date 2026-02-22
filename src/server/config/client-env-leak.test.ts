import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const scanRoots = ["src/app", "src/components", "src/lib"].map((part) => path.join(root, part));

const listFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
};

describe("client env leak guard", () => {
  it("prevents non-NEXT_PUBLIC env references in client components", () => {
    const candidates = scanRoots.flatMap((dir) => (fs.existsSync(dir) ? listFiles(dir) : []));
    const violations: string[] = [];

    for (const filePath of candidates) {
      const content = fs.readFileSync(filePath, "utf8");
      if (!/["']use client["']/.test(content)) continue;

      const matches = [...content.matchAll(/process\.env\.([A-Z0-9_]+)/g)];
      for (const match of matches) {
        const key = match[1] ?? "";
        if (!key.startsWith("NEXT_PUBLIC_")) {
          violations.push(`${path.relative(root, filePath)} -> process.env.${key}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("prevents dotenv usage in app source", () => {
    const candidates = scanRoots.flatMap((dir) => (fs.existsSync(dir) ? listFiles(dir) : []));
    const violations = candidates
      .filter((filePath) => /import\s+["']dotenv["']|from\s+["']dotenv["']/.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(root, filePath));

    expect(violations).toEqual([]);
  });
});
