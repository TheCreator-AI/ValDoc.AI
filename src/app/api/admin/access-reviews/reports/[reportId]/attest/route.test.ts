import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  attestAccessReviewReport: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/access-review/service", () => ({
  attestAccessReviewReport: mocks.attestAccessReviewReport
}));

import { POST } from "./route";

describe("attest access review report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN",
      email: "admin@amnion.com"
    });
  });

  it("attests report with password reauth", async () => {
    mocks.attestAccessReviewReport.mockResolvedValue({
      reportId: "rep1",
      signatureId: "sig1",
      reportHash: "hash1"
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "Password123!", remarks: "Quarterly review complete." })
      }),
      { params: Promise.resolve({ reportId: "rep1" }) }
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        signatureId: "sig1",
        reportHash: "hash1"
      })
    );
  });
});

