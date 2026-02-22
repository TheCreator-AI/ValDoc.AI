type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

const store = new Map<string, RateLimitBucket>();

const normalizeBackend = () => (process.env.RATE_LIMIT_BACKEND ?? "memory").trim().toLowerCase();

const buildRedisKey = (key: string) => `valdoc:rate-limit:${key}`;

const parseRedisPipelineResult = async (response: Response) => {
  if (!response.ok) {
    throw new Error(`Redis rate limit request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as Array<{ result?: string | number | null }>;
  const countRaw = payload[0]?.result;
  const ttlRaw = payload[1]?.result;
  const count = Number.parseInt(String(countRaw ?? "0"), 10);
  const ttlMs = Number.parseInt(String(ttlRaw ?? "0"), 10);
  return {
    count: Number.isFinite(count) ? count : 0,
    ttlMs: Number.isFinite(ttlMs) ? ttlMs : 0
  };
};

const checkAndConsumeRedisRateLimit = async (params: { key: string; limit: number; windowMs: number }) => {
  const redisUrl = (process.env.REDIS_REST_URL ?? "").trim();
  const redisToken = (process.env.REDIS_REST_TOKEN ?? "").trim();
  if (!redisUrl || !redisToken) {
    return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  }

  const endpoint = `${redisUrl.replace(/\/+$/, "")}/pipeline`;
  const key = buildRedisKey(params.key);
  const pipeline = [
    ["INCR", key],
    ["PTTL", key],
    ["PEXPIRE", key, String(params.windowMs), "NX"]
  ];

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(pipeline)
    });
    const { count, ttlMs } = await parseRedisPipelineResult(response);
    if (count > params.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : params.windowMs) / 1000))
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, params.limit - count),
      retryAfterSeconds: 0
    };
  } catch {
    return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  }
};

export const checkAndConsumeRateLimit = async (params: {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
}) => {
  const backend = normalizeBackend();
  if (backend === "gateway") {
    return {
      allowed: true,
      remaining: params.limit,
      retryAfterSeconds: 0
    };
  }
  if (backend === "redis") {
    return await checkAndConsumeRedisRateLimit({
      key: params.key,
      limit: params.limit,
      windowMs: params.windowMs
    });
  }

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
