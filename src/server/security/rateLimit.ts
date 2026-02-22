type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

const store = new Map<string, RateLimitBucket>();

export const checkAndConsumeRateLimit = (params: {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
}) => {
  const nowMs = params.nowMs ?? Date.now();
  const current = store.get(params.key);
  if (!current || current.resetAtMs <= nowMs) {
    const fresh: RateLimitBucket = {
      count: 1,
      resetAtMs: nowMs + params.windowMs
    };
    store.set(params.key, fresh);
    return { allowed: true, remaining: Math.max(0, params.limit - 1), retryAfterSeconds: 0 };
  }

  if (current.count >= params.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000))
    };
  }

  current.count += 1;
  store.set(params.key, current);
  return {
    allowed: true,
    remaining: Math.max(0, params.limit - current.count),
    retryAfterSeconds: 0
  };
};

export const resetRateLimitStore = () => {
  store.clear();
};
