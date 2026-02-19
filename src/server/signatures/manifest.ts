import { createHash } from "node:crypto";

const normalizeForHash = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeForHash((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
};

const normalizeContent = (content: string) => {
  try {
    const parsed = JSON.parse(content) as unknown;
    return JSON.stringify(normalizeForHash(parsed));
  } catch {
    return content.replace(/\r\n/g, "\n").trim();
  }
};

export const hashRecordContent = (content: string) => {
  const normalized = normalizeContent(content);
  return createHash("sha256").update(normalized).digest("hex");
};

