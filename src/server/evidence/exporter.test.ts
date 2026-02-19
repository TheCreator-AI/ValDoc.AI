import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildEvidenceManifest } from "@/server/evidence/exporter";

describe("evidence exporter manifest", () => {
  it("computes deterministic sha256 for each artifact", () => {
    const artifacts = {
      "system-configuration.json": "{\"a\":1}",
      "users-roles.json": "{\"users\":[]}"
    };

    const manifest = buildEvidenceManifest(artifacts);

    expect(manifest.artifacts["system-configuration.json"]).toBe(
      createHash("sha256").update("{\"a\":1}").digest("hex")
    );
    expect(manifest.artifacts["users-roles.json"]).toBe(
      createHash("sha256").update("{\"users\":[]}").digest("hex")
    );
  });
});
