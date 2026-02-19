import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";

const getNtpStatus = () => {
  const rawStatus = (process.env.NTP_SYNC_STATUS ?? "").trim();
  const rawLastSync = (process.env.NTP_LAST_SYNC_UTC ?? "").trim();

  if (rawStatus) {
    return {
      status: rawStatus,
      lastSyncUtc: rawLastSync || null,
      assumption:
        "NTP status is provided via deployment environment. Ensure host-level NTP monitoring/alerting is enabled."
    };
  }

  return {
    status: "ASSUMED_HOST_MANAGED",
    lastSyncUtc: null,
    assumption:
      "Application assumes host/container time synchronization is managed externally (e.g., chrony/systemd-timesyncd/cloud provider)."
  };
};

export async function GET(request: Request) {
  try {
    await getSessionOrThrowWithPermission(request, "audit.read");
    return apiJson(200, {
      serverTimeUtc: new Date().toISOString(),
      appTimezone: (process.env.APP_TIMEZONE ?? "UTC").trim() || "UTC",
      ntp: getNtpStatus()
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to resolve system time status." });
  }
}
