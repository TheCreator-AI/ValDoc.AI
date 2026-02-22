import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAndConsumeRateLimit, resetRateLimitStore } from "@/server/security/rateLimit";

describe("rate limiter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RATE_LIMIT_BACKEND;
    delete process.env.REDIS_REST_URL;
    delete process.env.REDIS_REST_TOKEN;
    resetRateLimitStore();
  });

  it("blocks after threshold until window resets for in-memory mode", async () => {
    process.env.RATE_LIMIT_BACKEND = "memory";
    const key = "k1";
    const limit = 2;
    const windowMs = 1_000;

    const first = await checkAndConsumeRateLimit({ key, limit, windowMs, nowMs: 0 });
    const second = await checkAndConsumeRateLimit({ key, limit, windowMs, nowMs: 1 });
    const third = await checkAndConsumeRateLimit({ key, limit, windowMs, nowMs: 2 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);

    const afterWindow = await checkAndConsumeRateLimit({ key, limit, windowMs, nowMs: 1_500 });
    expect(afterWindow.allowed).toBe(true);
  });

  it("uses Redis REST backend when configured", async () => {
    process.env.RATE_LIMIT_BACKEND = "redis";
    process.env.REDIS_REST_URL = "https://redis.example.com";
    process.env.REDIS_REST_TOKEN = "token";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { result: 3 },
            { result: 900 }
          ])
        )
      );

    const result = await checkAndConsumeRateLimit({
      key: "auth:user",
      limit: 2,
      windowMs: 1000
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://redis.example.com/pipeline",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" })
      })
    );
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(1);
  });

  it("fails closed when Redis backend is configured without credentials", async () => {
    process.env.RATE_LIMIT_BACKEND = "redis";
    const result = await checkAndConsumeRateLimit({
      key: "auth:user",
      limit: 2,
      windowMs: 1000
    });
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
});
