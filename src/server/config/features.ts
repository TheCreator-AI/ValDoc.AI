type RawEnv = Record<string, string | undefined>;

export const featureFlagCatalog = {
  TEMPLATE_SUGGESTIONS: true,
  EXECUTED_SUMMARY_GENERATION: true,
  SCHEDULED_AUDIT_CHAIN_VERIFICATION: true,
  STRICT_EXPORT_ANTI_ENUMERATION: true
} as const;

export type FeatureFlagKey = keyof typeof featureFlagCatalog;
export type FeatureFlagMap = Record<FeatureFlagKey, boolean>;

const knownFlags = new Set<FeatureFlagKey>(Object.keys(featureFlagCatalog) as FeatureFlagKey[]);

const parseBoolean = (value: unknown, key: string) => {
  if (typeof value !== "boolean") {
    throw new Error(`Feature flag '${key}' must be a boolean.`);
  }
  return value;
};

export const parseFeatureFlags = (raw: RawEnv): FeatureFlagMap => {
  const defaults = { ...featureFlagCatalog } as FeatureFlagMap;
  const rawJson = (raw.CLIENT_FEATURE_FLAGS_JSON ?? "").trim();
  if (!rawJson) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("CLIENT_FEATURE_FLAGS_JSON must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CLIENT_FEATURE_FLAGS_JSON must be a JSON object.");
  }

  const overrides = parsed as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (!knownFlags.has(key as FeatureFlagKey)) {
      throw new Error(`Unknown feature flag '${key}' in CLIENT_FEATURE_FLAGS_JSON.`);
    }
    defaults[key as FeatureFlagKey] = parseBoolean(value, key);
  }

  return defaults;
};

export const getFeatureFlags = (): FeatureFlagMap => parseFeatureFlags(process.env);

export const isFeatureEnabled = (flag: FeatureFlagKey, raw: RawEnv = process.env) => parseFeatureFlags(raw)[flag];
