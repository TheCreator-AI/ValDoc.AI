import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  organizationFindFirst: vi.fn(),
  getRetentionConfiguration: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    organization: {
      findFirst: mocks.organizationFindFirst
    }
  }
}));

vi.mock("@/server/retention/service", () => ({
  getRetentionConfiguration: mocks.getRetentionConfiguration
}));

import { GET } from "./route";

describe("GET /api/configuration/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN"
    });
    mocks.organizationFindFirst.mockResolvedValue({
      id: "org1",
      name: "Acme Bio"
    });
    mocks.getRetentionConfiguration.mockResolvedValue({
      auditEventRetentionDays: 2555,
      documentVersionRetentionDays: null,
      legalHoldEnabled: true
    });
  });

  it("returns single-tenant org and retention configuration", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.organization.name).toBe("Acme Bio");
    expect(body.retention).toBeDefined();
    expect(body.retention.legalHoldEnabled).toBe(true);
    expect(body.backup).toBeDefined();
  });
});
