import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrowWithPermission: mocks.getSessionOrThrowWithPermission
  };
});

import { GET } from "./route";

describe("GET /api/admin/system-time-status", () => {
  const originalTimezone = process.env.APP_TIMEZONE;
  const originalNtpStatus = process.env.NTP_SYNC_STATUS;
  const originalNtpLastSync = process.env.NTP_LAST_SYNC_UTC;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_TIMEZONE = originalTimezone;
    process.env.NTP_SYNC_STATUS = originalNtpStatus;
    process.env.NTP_LAST_SYNC_UTC = originalNtpLastSync;
    mocks.getSessionOrThrowWithPermission.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN"
    });
  });

  it("returns server UTC time and deployment ntp status", async () => {
    process.env.APP_TIMEZONE = "UTC";
    process.env.NTP_SYNC_STATUS = "SYNCED";
    process.env.NTP_LAST_SYNC_UTC = "2026-02-18T00:00:00.000Z";

    const response = await GET(new Request("http://localhost/api/admin/system-time-status"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.serverTimeUtc).toMatch(/Z$/);
    expect(body.appTimezone).toBe("UTC");
    expect(body.ntp.status).toBe("SYNCED");
    expect(body.ntp.lastSyncUtc).toBe("2026-02-18T00:00:00.000Z");
  });

  it("enforces permission", async () => {
    mocks.getSessionOrThrowWithPermission.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await GET(new Request("http://localhost/api/admin/system-time-status"));
    expect(response.status).toBe(403);
  });
});
