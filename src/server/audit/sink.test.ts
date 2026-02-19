import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitAuditEventToSink } from "@/server/audit/sink";

describe("audit sink", () => {
  const envBackup = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...envBackup };
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("skips forwarding when sink url is not configured", async () => {
    delete process.env.AUDIT_SINK_URL;

    const result = await emitAuditEventToSink({
      eventId: "ae_1",
      organizationId: "org_1",
      action: "audit.write",
      eventHash: "hash_1",
      prevHash: "",
      timestampIso: "2026-02-19T00:00:00.000Z"
    });

    expect(result.forwarded).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts sanitized audit payload when configured", async () => {
    process.env.AUDIT_SINK_URL = "https://siem.example.com/events";
    process.env.AUDIT_SINK_API_KEY = "token-123";
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const result = await emitAuditEventToSink({
      eventId: "ae_1",
      organizationId: "org_1",
      action: "audit.write",
      eventHash: "hash_1",
      prevHash: "",
      timestampIso: "2026-02-19T00:00:00.000Z",
      metadataJson: "{\"a\":1}"
    });

    expect(result.forwarded).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://siem.example.com/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer token-123"
        }),
        body: expect.stringContaining("\"eventId\":\"ae_1\"")
      })
    );
  });

  it("throws when sink is required and forwarding fails", async () => {
    process.env.AUDIT_SINK_URL = "https://siem.example.com/events";
    process.env.AUDIT_SINK_REQUIRED = "true";
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: vi.fn().mockResolvedValue("down") });

    await expect(
      emitAuditEventToSink({
        eventId: "ae_1",
        organizationId: "org_1",
        action: "audit.write",
        eventHash: "hash_1",
        prevHash: "",
        timestampIso: "2026-02-19T00:00:00.000Z"
      })
    ).rejects.toThrow(/Audit sink forwarding failed/);
  });
});
