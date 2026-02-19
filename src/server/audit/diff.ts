export type FieldChange = {
  changePath: string;
  oldValue: string | null;
  newValue: string | null;
};

const toStoredValue = (value: unknown): string | null => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const appendPath = (base: string, segment: string) => (base ? `${base}.${segment}` : segment);
const appendIndex = (base: string, index: number) => `${base}[${index}]`;

const walkDiff = (oldValue: unknown, newValue: unknown, path: string, changes: FieldChange[]) => {
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    const max = Math.max(oldValue.length, newValue.length);
    for (let index = 0; index < max; index += 1) {
      walkDiff(oldValue[index], newValue[index], appendIndex(path, index), changes);
    }
    return;
  }

  if (isObject(oldValue) && isObject(newValue)) {
    const keys = Array.from(new Set([...Object.keys(oldValue), ...Object.keys(newValue)])).sort();
    for (const key of keys) {
      walkDiff(oldValue[key], newValue[key], appendPath(path, key), changes);
    }
    return;
  }

  if (Object.is(oldValue, newValue)) {
    return;
  }

  changes.push({
    changePath: path || "$",
    oldValue: toStoredValue(oldValue),
    newValue: toStoredValue(newValue)
  });
};

const tryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const diffJsonContent = (oldContent: string, newContent: string): FieldChange[] => {
  const oldParsed = tryParseJson(oldContent);
  const newParsed = tryParseJson(newContent);
  const changes: FieldChange[] = [];
  walkDiff(oldParsed, newParsed, "", changes);
  return changes;
};
