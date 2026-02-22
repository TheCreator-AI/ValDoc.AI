import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordOrgBoundaryAttempt, resetOrgBoundaryMitigation } from "@/server/security/orgBoundary";

describe("org boundary security logging and mitigation", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  beforeEach(() => {
    warnSpy.mockClear();
    vi.stubEnv("ORG_BOUNDARY_ATTEMPT_LIMIT", "2");
    vi.stubEnv("ORG_BOUNDARY_ATTEMPT_WINDOW_MS", "60000");
    resetOrgBoundaryMitigation();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetOrgBoundaryMitigation();
  });

  it("logs structured cross-org attempt metadata without payload content", () => {
    const result = recordOrgBoundaryAttempt({
      actorUserId: "user_a",
      actorOrgId: "org_a",
      targetOrgId: "org_b",
      endpoint: "/api/documents/doc_b/versions",
      operation: "GeneratedDocument.findFirst",
      requestId: "req-123",
      reason: "cross_org_query"
    });

    expect(result.blocked).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warnSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(logged.category).toBe("security.org_boundary");
    expect(logged.requestId).toBe("req-123");
    expect(logged.actorUserId).toBe("user_a");
    expect(logged.actorOrgId).toBe("org_a");
    expect(logged.targetOrgId).toBe("org_b");
    expect(logged.endpoint).toBe("/api/documents/doc_b/versions");
    expect(logged.operation).toBe("GeneratedDocument.findFirst");
    expect(logged).not.toHaveProperty("payload");
    expect(logged).not.toHaveProperty("args");
  });

  it("rate-limits repeated cross-org attempts", () => {
    const first = recordOrgBoundaryAttempt({
      actorUserId: "user_a",
      actorOrgId: "org_a",
      targetOrgId: "org_b",
      operation: "Machine.findFirst",
      reason: "cross_org_query"
    });
    const second = recordOrgBoundaryAttempt({
      actorUserId: "user_a",
      actorOrgId: "org_a",
      targetOrgId: "org_b",
      operation: "Machine.findFirst",
      reason: "cross_org_query"
    });
    const third = recordOrgBoundaryAttempt({
      actorUserId: "user_a",
      actorOrgId: "org_a",
      targetOrgId: "org_b",
      operation: "Machine.findFirst",
      reason: "cross_org_query"
    });

    expect(first.blocked).toBe(false);
    expect(second.blocked).toBe(false);
    expect(third.blocked).toBe(true);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});
