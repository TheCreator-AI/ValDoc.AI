import { randomUUID } from "node:crypto";
import { checkAndConsumeRateLimit, resetRateLimitStore } from "@/server/security/rateLimit";

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

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
  const rateLimit = checkAndConsumeRateLimit({
    key: `org-boundary:${attempt.actorOrgId ?? "unknown"}:${attempt.actorUserId ?? "unknown"}:${attempt.targetOrgId ?? "unknown"}`,
    limit,
    windowMs
  });

  const event = {
    category: "security.org_boundary",
    requestId,
    actorUserId: attempt.actorUserId ?? "unknown",
    actorOrgId: attempt.actorOrgId ?? "unknown",
    targetOrgId: attempt.targetOrgId ?? "unknown",
    endpoint: attempt.endpoint ?? "unknown",
    operation: attempt.operation,
    reason: attempt.reason,
    mitigation: rateLimit.allowed ? "deny" : "rate_limited",
    retryAfterSeconds: rateLimit.retryAfterSeconds,
    timestamp: new Date().toISOString()
  };
  console.warn(JSON.stringify(event));

  return {
    blocked: !rateLimit.allowed,
    retryAfterSeconds: rateLimit.retryAfterSeconds,
    requestId
  };
};

export const resetOrgBoundaryMitigation = () => {
  resetRateLimitStore();
};
