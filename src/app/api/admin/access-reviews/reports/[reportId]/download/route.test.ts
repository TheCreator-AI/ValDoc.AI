import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  getAccessReviewReportForDownload: vi.fn(),
  readFile: vi.fn(),
  ensureStoragePathIsSafe: vi.fn()
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: mocks.readFile
  }
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/access-review/service", () => ({
  getAccessReviewReportForDownload: mocks.getAccessReviewReportForDownload
}));

vi.mock("@/server/files/storage", () => ({
  ensureStoragePathIsSafe: mocks.ensureStoragePathIsSafe
}));

import { GET } from "./route";

describe("download access review report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN",
      email: "admin@amnion.com"
    });
    mocks.getAccessReviewReportForDownload.mockResolvedValue({
      id: "rep1",
      reportPath: "C:\\tmp\\access-review-rep1.csv",
      reportFormat: "csv"
    });
    mocks.readFile.mockResolvedValue(Buffer.from("header\nrow"));
  });

  it("returns attachment with nosniff", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ reportId: "rep1" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mocks.ensureStoragePathIsSafe).toHaveBeenCalled();
  });
});

