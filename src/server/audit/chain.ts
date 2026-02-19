import { createHash } from "node:crypto";

export type AuditChainEventPayload = {
  organizationId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  outcome: "SUCCESS" | "DENIED";
  metadataJson: string | null;
  detailsJson: string | null;
  ip: string | null;
  userAgent: string | null;
  timestampIso: string;
};

type AuditChainRow = {
  id: string;
  prevHash: string | null;
  eventHash: string | null;
  payload: AuditChainEventPayload;
};

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const segments = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
  return `{${segments.join(",")}}`;
};

export const computeEventHash = (prevHash: string, payload: AuditChainEventPayload) => {
  const canonicalPayload = canonicalize(payload);
  return createHash("sha256").update(`${prevHash}${canonicalPayload}`).digest("hex");
};

export const verifyAuditChain = (events: AuditChainRow[]) => {
  let expectedPrev = "";
  for (const event of events) {
    const actualPrev = event.prevHash ?? "";
    if (actualPrev !== expectedPrev) {
      return { ok: false, brokenEventId: event.id, reason: "prev_hash_mismatch" as const };
    }
    const expectedHash = computeEventHash(expectedPrev, event.payload);
    if (!event.eventHash || event.eventHash !== expectedHash) {
      return { ok: false, brokenEventId: event.id, reason: "event_hash_mismatch" as const };
    }
    expectedPrev = event.eventHash;
  }
  return { ok: true, brokenEventId: null, reason: null, headHash: expectedPrev };
};
