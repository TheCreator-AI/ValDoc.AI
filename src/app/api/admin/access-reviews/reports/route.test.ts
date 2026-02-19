import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  listAccessReviewReports: vi.fn(),
  generateAccessReviewReport: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/access-review/service", () => ({
  listAccessReviewReports: mocks.listAccessReviewReports,
  generateAccessReviewReport: mocks.generateAccessReviewReport
}));

import { GET, POST } from "./route";

describe("admin access review reports route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN",
      email: "admin@amnion.com"
    });
  });

  it("lists reports for current org", async () => {
    mocks.listAccessReviewReports.mockResolvedValue([{ id: "rep1" }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "rep1" }]);
  });

  it("generates a new report", async () => {
    mocks.generateAccessReviewReport.mockResolvedValue({
      id: "rep1",
      reportHash: "abc",
      createdAt: "2026-02-20T00:00:00.000Z"
    });

    const response = await POST(new Request("http://localhost/api/admin/access-reviews/reports", { method: "POST" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        id: "rep1",
        reportHash: "abc"
      })
    );
  });
});

