import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  getRetentionConfiguration: vi.fn(),
  updateRetentionConfiguration: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/retention/service", () => ({
  getRetentionConfiguration: mocks.getRetentionConfiguration,
  updateRetentionConfiguration: mocks.updateRetentionConfiguration
}));

import { GET, PUT } from "./route";

describe("admin retention config route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "admin-1",
      organizationId: "org-1",
      role: "ADMIN"
    });
  });

  it("returns current retention config", async () => {
    mocks.getRetentionConfiguration.mockResolvedValue({
      auditEventRetentionDays: 2555,
      documentVersionRetentionDays: null,
      legalHoldEnabled: true
    });
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.legalHoldEnabled).toBe(true);
  });

  it("updates retention config", async () => {
    mocks.updateRetentionConfiguration.mockResolvedValue({
      auditEventRetentionDays: 1800,
      documentVersionRetentionDays: null,
      legalHoldEnabled: true
    });
    const response = await PUT(
      new Request("http://localhost/api/admin/retention/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditEventRetentionDays: 1800, legalHoldEnabled: true })
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.updateRetentionConfiguration).toHaveBeenCalled();
  });

  it("enforces authorization", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await GET();
    expect(response.status).toBe(403);
  });
});
