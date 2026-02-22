import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceOrgScopedArgs } from "@/server/db/org-scope";

const securityMocks = vi.hoisted(() => ({
  recordOrgBoundaryAttempt: vi.fn()
}));

vi.mock("@/server/security/orgBoundary", () => ({
  recordOrgBoundaryAttempt: securityMocks.recordOrgBoundaryAttempt
}));

describe("org scope enforcement", () => {
  beforeEach(() => {
    securityMocks.recordOrgBoundaryAttempt.mockReturnValue({ blocked: false, retryAfterSeconds: 0, requestId: "req-default" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("throws for unscoped org-owned model access in non-test mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      enforceOrgScopedArgs({
        model: "Machine",
        action: "findMany",
        args: {},
        organizationId: undefined
      })
    ).toThrow(/Cross-organization access blocked/);
  });

  it("injects organizationId scope into where clause", () => {
    const scoped = enforceOrgScopedArgs({
      model: "Machine",
      action: "findMany",
      args: { where: { name: { contains: "TSX" } } },
      organizationId: "org_a"
    }) as { where: unknown };
    expect(scoped.where).toEqual({
      AND: [{ name: { contains: "TSX" } }, { organizationId: "org_a" }]
    });
  });

  it("records structured boundary metadata on cross-org where mismatch", () => {
    securityMocks.recordOrgBoundaryAttempt.mockReturnValue({ blocked: false, retryAfterSeconds: 0, requestId: "req-1" });
    expect(() =>
      enforceOrgScopedArgs({
        model: "Machine",
        action: "findFirst",
        args: { where: { organizationId: "org_b" } },
        organizationId: "org_a",
        actorUserId: "user_a",
        endpoint: "/api/machines/machine_b"
      })
    ).toThrow(/Cross-organization access blocked/);

    expect(securityMocks.recordOrgBoundaryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user_a",
        actorOrgId: "org_a",
        targetOrgId: "org_b",
        endpoint: "/api/machines/machine_b",
        operation: "Machine.findFirst",
        reason: "cross_org_query"
      })
    );
  });
});
