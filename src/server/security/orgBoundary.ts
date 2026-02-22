import { randomUUID } from "node:crypto";

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
type OrgBoundaryBucket = { count: number; resetAtMs: number };
const orgBoundaryStore = new Map<string, OrgBoundaryBucket>();

const readPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

type OrgBoundaryAttempt = {
  actorUserId?: string;
  actorOrgId?: string;
  targetOrgId?: string;
  endpoint?: string;
  operation: string;
  requestId?: string;
  reason: "cross_org_query" | "cross_org_write" | "unscoped_org_owned_model";
};

export const recordOrgBoundaryAttempt = (attempt: OrgBoundaryAttempt) => {
  const requestId = attempt.requestId ?? randomUUID();
  const limit = readPositiveInt(process.env.ORG_BOUNDARY_ATTEMPT_LIMIT, DEFAULT_LIMIT);
  const windowMs = readPositiveInt(process.env.ORG_BOUNDARY_ATTEMPT_WINDOW_MS, DEFAULT_WINDOW_MS);
  const key = `org-boundary:${attempt.actorOrgId ?? "unknown"}:${attempt.actorUserId ?? "unknown"}:${attempt.targetOrgId ?? "unknown"}`;
  const nowMs = Date.now();
  const current = orgBoundaryStore.get(key);
  if (!current || current.resetAtMs <= nowMs) {
    orgBoundaryStore.set(key, { count: 1, resetAtMs: nowMs + windowMs });
  } else {
    current.count += 1;
    orgBoundaryStore.set(key, current);
  }
  const active = orgBoundaryStore.get(key)!;
  const blocked = active.count > limit;
  const retryAfterSeconds = blocked ? Math.max(1, Math.ceil((active.resetAtMs - nowMs) / 1000)) : 0;

  const event = {
    category: "security.org_boundary",
    requestId,
    actorUserId: attempt.actorUserId ?? "unknown",
    actorOrgId: attempt.actorOrgId ?? "unknown",
    targetOrgId: attempt.targetOrgId ?? "unknown",
    endpoint: attempt.endpoint ?? "unknown",
    operation: attempt.operation,
    reason: attempt.reason,
    mitigation: blocked ? "rate_limited" : "deny",
    retryAfterSeconds,
    timestamp: new Date().toISOString()
  };
  console.warn(JSON.stringify(event));

  return {
    blocked,
    retryAfterSeconds,
    requestId
  };
};

export const resetOrgBoundaryMitigation = () => {
  orgBoundaryStore.clear();
};
