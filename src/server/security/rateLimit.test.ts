import { describe, expect, it } from "vitest";
import { checkAndConsumeRateLimit, resetRateLimitStore } from "@/server/security/rateLimit";

describe("rate limiter", () => {
  it("blocks after threshold until window resets", () => {
    const key = "k1";
    const limit = 2;
    const windowMs = 1_000;

    const first = checkAndConsumeRateLimit({ key, limit, windowMs, nowMs: 0 });
    const second = checkAndConsumeRateLimit({ key, limit, windowMs, nowMs: 1 });
    const third = checkAndConsumeRateLimit({ key, limit, windowMs, nowMs: 2 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);

    const afterWindow = checkAndConsumeRateLimit({ key, limit, windowMs, nowMs: 1_500 });
    expect(afterWindow.allowed).toBe(true);
    resetRateLimitStore();
  });
});
