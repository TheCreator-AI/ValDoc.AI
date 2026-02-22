import { describe, expect, it } from "vitest";
import { computeEventHash, verifyAuditChain } from "@/server/audit/chain";

const payload = (id: string) => ({
  organizationId: "org1",
  actorUserId: "u1",
  action: "document.version.create",
  entityType: "DocumentVersion",
  entityId: id,
  outcome: "SUCCESS" as const,
  metadataJson: "{\"k\":\"v\"}",
  detailsJson: "{\"k\":\"v\"}",
  ip: null,
  userAgent: "Vitest",
  timestampIso: "2026-02-18T00:00:00.000Z"
});

describe("audit hash chain", () => {
  it("verifies a valid chain", () => {
    const firstHash = computeEventHash("", payload("v1"));
    const secondHash = computeEventHash(firstHash, payload("v2"));
    const result = verifyAuditChain([
      { id: "e1", prevHash: "", eventHash: firstHash, payload: payload("v1") },
      { id: "e2", prevHash: firstHash, eventHash: secondHash, payload: payload("v2") }
    ]);
    expect(result.ok).toBe(true);
  });

  it("fails when an out-of-band inserted event breaks chain", () => {
    const firstHash = computeEventHash("", payload("v1"));
    const thirdHash = computeEventHash(firstHash, payload("v3"));
    const result = verifyAuditChain([
      { id: "e1", prevHash: "", eventHash: firstHash, payload: payload("v1") },
      {
        id: "eX",
        prevHash: "out-of-band-prev",
        eventHash: "out-of-band-hash",
        payload: payload("external")
      },
      { id: "e3", prevHash: firstHash, eventHash: thirdHash, payload: payload("v3") }
    ]);
    expect(result.ok).toBe(false);
    expect(result.brokenEventId).toBe("eX");
  });

  it("fails when events from different organizations are mixed into one chain", () => {
    const first = payload("v1");
    const second = { ...payload("v2"), organizationId: "org2" };
    const firstHash = computeEventHash("", first);
    const secondHash = computeEventHash(firstHash, second);
    const result = verifyAuditChain([
      { id: "e1", prevHash: "", eventHash: firstHash, payload: first },
      { id: "e2", prevHash: firstHash, eventHash: secondHash, payload: second }
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("organization_mismatch");
    expect(result.brokenEventId).toBe("e2");
  });

  it("hashes equivalent metadata JSON deterministically regardless of key order", () => {
    const a = {
      ...payload("v1"),
      metadataJson: "{\"a\":1,\"b\":2}",
      detailsJson: "{\"x\":1,\"y\":2}"
    };
    const b = {
      ...payload("v1"),
      metadataJson: "{\"b\":2,\"a\":1}",
      detailsJson: "{\"y\":2,\"x\":1}"
    };
    expect(computeEventHash("", a)).toBe(computeEventHash("", b));
  });
});
