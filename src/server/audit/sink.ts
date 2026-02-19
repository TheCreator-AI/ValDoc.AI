type AuditSinkConfig = {
  enabled: boolean;
  required: boolean;
  url: string | null;
  timeoutMs: number;
  hasApiKey: boolean;
};

export type AuditSinkEvent = {
  eventId: string;
  organizationId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  outcome?: "SUCCESS" | "DENIED";
  metadataJson?: string | null;
  detailsJson?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  prevHash: string;
  eventHash: string;
  timestampIso: string;
};

const toBoolean = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  return value.trim().toLowerCase() === "true";
};

const toPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getAuditSinkConfig = (): AuditSinkConfig => {
  const url = (process.env.AUDIT_SINK_URL ?? "").trim();
  const apiKey = (process.env.AUDIT_SINK_API_KEY ?? "").trim();
  return {
    enabled: url.length > 0,
    required: toBoolean(process.env.AUDIT_SINK_REQUIRED, false),
    url: url || null,
    timeoutMs: toPositiveInt(process.env.AUDIT_SINK_TIMEOUT_MS, 1500),
    hasApiKey: apiKey.length > 0
  };
};

const withTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
};

export const emitAuditEventToSink = async (
  event: AuditSinkEvent
): Promise<{ forwarded: boolean }> => {
  const config = getAuditSinkConfig();
  if (!config.enabled || !config.url) {
    return { forwarded: false };
  }

  const apiKey = (process.env.AUDIT_SINK_API_KEY ?? "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const timeout = withTimeoutSignal(config.timeoutMs);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
      signal: timeout.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`status=${response.status}${body ? ` body=${body.slice(0, 256)}` : ""}`);
    }
    return { forwarded: true };
  } catch (error) {
    if (config.required) {
      throw new Error(`Audit sink forwarding failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { forwarded: false };
  } finally {
    timeout.cancel();
  }
};
