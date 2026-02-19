import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  listLegalHolds: vi.fn(),
  createLegalHold: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/retention/service", () => ({
  listLegalHolds: mocks.listLegalHolds,
  createLegalHold: mocks.createLegalHold
}));

import { GET, POST } from "./route";

describe("admin legal holds route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "admin-1",
      organizationId: "org-1",
      role: "ADMIN"
    });
  });

  it("lists active legal holds", async () => {
    mocks.listLegalHolds.mockResolvedValue([{ id: "hold-1", recordType: "GENERATED_DOCUMENT", recordId: "doc-1" }]);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.length).toBe(1);
  });

  it("creates a legal hold", async () => {
    mocks.createLegalHold.mockResolvedValue({ id: "hold-1" });
    const response = await POST(
      new Request("http://localhost/api/admin/retention/legal-holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordType: "GENERATED_DOCUMENT", recordId: "doc-1", reason: "Investigation open" })
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.createLegalHold).toHaveBeenCalled();
  });

  it("returns 403 on insufficient permission", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await GET();
    expect(response.status).toBe(403);
  });
});
