import { describe, expect, it } from "vitest";
import { isFeatureEnabled, parseFeatureFlags } from "@/server/config/features";

describe("feature flags", () => {
  it("returns defaults when no overrides are provided", () => {
    const flags = parseFeatureFlags({});
    expect(flags.TEMPLATE_SUGGESTIONS).toBe(true);
    expect(flags.EXECUTED_SUMMARY_GENERATION).toBe(true);
  });

  it("accepts known overrides from CLIENT_FEATURE_FLAGS_JSON", () => {
    const flags = parseFeatureFlags({
      CLIENT_FEATURE_FLAGS_JSON: JSON.stringify({
        TEMPLATE_SUGGESTIONS: false,
        STRICT_EXPORT_ANTI_ENUMERATION: true
      })
    });
    expect(flags.TEMPLATE_SUGGESTIONS).toBe(false);
    expect(flags.STRICT_EXPORT_ANTI_ENUMERATION).toBe(true);
  });

  it("rejects unknown feature flags", () => {
    expect(() =>
      parseFeatureFlags({
        CLIENT_FEATURE_FLAGS_JSON: JSON.stringify({ UNKNOWN_FLAG: true })
      })
    ).toThrow(/Unknown feature flag/);
  });

  it("rejects non-boolean flag values", () => {
    expect(() =>
      parseFeatureFlags({
        CLIENT_FEATURE_FLAGS_JSON: JSON.stringify({ TEMPLATE_SUGGESTIONS: "yes" })
      })
    ).toThrow(/must be a boolean/);
  });

  it("supports direct enabled checks for guarded behavior", () => {
    const enabled = isFeatureEnabled("TEMPLATE_SUGGESTIONS", {
      CLIENT_FEATURE_FLAGS_JSON: JSON.stringify({ TEMPLATE_SUGGESTIONS: false })
    });
    expect(enabled).toBe(false);
  });
});
