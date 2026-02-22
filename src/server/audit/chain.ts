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

const normalizeText = (value: string | null) => (value ?? "").normalize("NFC").replace(/\r\n/g, "\n");

const canonicalizePossiblyJson = (value: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  try {
    return canonicalize(JSON.parse(normalized));
  } catch {
    return normalized;
  }
};

const canonicalizeEventEnvelope = (prevHash: string, payload: AuditChainEventPayload) => {
  const envelope = {
    version: 1,
    prevHash: normalizeText(prevHash),
    organizationId: normalizeText(payload.organizationId),
    actorUserId: normalizeText(payload.actorUserId),
    action: normalizeText(payload.action),
    entityType: normalizeText(payload.entityType),
    entityId: normalizeText(payload.entityId),
    outcome: normalizeText(payload.outcome),
    timestampIso: normalizeText(payload.timestampIso),
    ip: normalizeText(payload.ip),
    userAgent: normalizeText(payload.userAgent),
    metadataJson: canonicalizePossiblyJson(payload.metadataJson),
    detailsJson: canonicalizePossiblyJson(payload.detailsJson)
  };
  return canonicalize(envelope);
};

export const computeEventHash = (prevHash: string, payload: AuditChainEventPayload) => {
  const canonicalPayload = canonicalizeEventEnvelope(prevHash, payload);
  return createHash("sha256").update(Buffer.from(canonicalPayload, "utf8")).digest("hex");
};

export const verifyAuditChain = (events: AuditChainRow[]) => {
  let chainOrgId: string | null = null;
  let expectedPrev = "";
  for (const event of events) {
    if (!chainOrgId) {
      chainOrgId = event.payload.organizationId;
    } else if (event.payload.organizationId !== chainOrgId) {
      return { ok: false, brokenEventId: event.id, reason: "organization_mismatch" as const };
    }
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
