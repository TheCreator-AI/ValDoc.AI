import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  releaseLegalHold: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/retention/service", () => ({
  releaseLegalHold: mocks.releaseLegalHold
}));

import { POST } from "./route";

describe("release legal hold route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "admin-1",
      organizationId: "org-1",
      role: "ADMIN"
    });
  });

  it("releases hold", async () => {
    mocks.releaseLegalHold.mockResolvedValue({ id: "hold-1", isActive: false });
    const response = await POST(
      new Request("http://localhost/api/admin/retention/legal-holds/hold-1/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Investigation closed" })
      }),
      { params: Promise.resolve({ holdId: "hold-1" }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isActive).toBe(false);
  });

  it("enforces admin permission", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await POST(
      new Request("http://localhost/api/admin/retention/legal-holds/hold-1/release", { method: "POST" }),
      { params: Promise.resolve({ holdId: "hold-1" }) }
    );
    expect(response.status).toBe(403);
  });
});
