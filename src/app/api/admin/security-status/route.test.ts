import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  getAuthPolicy: vi.fn(),
  isTwoPersonRuleEnforced: vi.fn(),
  getAuditSinkConfig: vi.fn(),
  getFeatureFlags: vi.fn(),
  getDeploymentReadiness: vi.fn(),
  findAuditChainHead: vi.fn(),
  findOrganization: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrowWithPermission: mocks.getSessionOrThrowWithPermission
  };
});

vi.mock("@/server/auth/policy", () => ({
  getAuthPolicy: mocks.getAuthPolicy
}));

vi.mock("@/server/compliance/segregationOfDuties", () => ({
  isTwoPersonRuleEnforced: mocks.isTwoPersonRuleEnforced
}));

vi.mock("@/server/audit/sink", () => ({
  getAuditSinkConfig: mocks.getAuditSinkConfig
}));

vi.mock("@/server/config/features", () => ({
  getFeatureFlags: mocks.getFeatureFlags
}));

vi.mock("@/server/security/readiness", () => ({
  getDeploymentReadiness: mocks.getDeploymentReadiness
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    auditChainHead: {
      findUnique: mocks.findAuditChainHead
    },
    organization: {
      findFirst: mocks.findOrganization
    }
  }
}));

import { GET } from "./route";

describe("GET /api/admin/security-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrowWithPermission.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN"
    });
    mocks.getAuthPolicy.mockReturnValue({ requirePrivilegedMfa: true });
    mocks.isTwoPersonRuleEnforced.mockReturnValue(true);
    mocks.getAuditSinkConfig.mockReturnValue({
      enabled: true,
      required: false,
      url: "https://siem.example.com/events",
      timeoutMs: 1500,
      hasApiKey: true
    });
    mocks.getFeatureFlags.mockReturnValue({
      TEMPLATE_SUGGESTIONS: true,
      EXECUTED_SUMMARY_GENERATION: true,
      SCHEDULED_AUDIT_CHAIN_VERIFICATION: true,
      STRICT_EXPORT_ANTI_ENUMERATION: true
    });
    mocks.getDeploymentReadiness.mockReturnValue({
      ready: true,
      environment: "production",
      checks: [{ key: "database_posture", status: "pass", message: "ok" }]
    });
    mocks.findAuditChainHead.mockResolvedValue({ headHash: "abc123" });
    mocks.findOrganization.mockResolvedValue({ id: "org1", name: "Amnion" });
  });

  it("returns summarized security posture controls", async () => {
    const response = await GET(new Request("http://localhost/api/admin/security-status"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.organizationName).toBe("Amnion");
    expect(body.controls.privilegedMfa.required).toBe(true);
    expect(body.controls.twoPersonRule.enforced).toBe(true);
    expect(body.controls.auditChain.headPresent).toBe(true);
    expect(body.controls.auditSink.enabled).toBe(true);
    expect(body.controls.clientFeatureFlags.TEMPLATE_SUGGESTIONS).toBe(true);
    expect(body.controls.deploymentReadiness.ready).toBe(true);
  });

  it("enforces admin-level permission check", async () => {
    mocks.getSessionOrThrowWithPermission.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await GET(new Request("http://localhost/api/admin/security-status"));
    expect(response.status).toBe(403);
  });
});
