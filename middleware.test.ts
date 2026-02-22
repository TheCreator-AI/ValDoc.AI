import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const getHeader = (response: Response, key: string) => response.headers.get(key);

describe("security headers middleware", () => {
  it("adds hardened headers on app routes", () => {
    const request = new NextRequest("http://localhost:3000/");
    const response = middleware(request);

    expect(getHeader(response, "X-Content-Type-Options")).toBe("nosniff");
    expect(getHeader(response, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(getHeader(response, "Permissions-Policy")).toContain("camera=()");
    expect(getHeader(response, "Content-Security-Policy")).toContain("default-src 'self'");
  });

  it("adds security headers on CSRF-denied API responses", async () => {
    const request = new NextRequest("http://localhost:3000/api/health", {
      method: "POST",
      headers: {
        cookie: "valdoc_token=test-session-token",
        origin: "https://evil.example"
      }
    });

    const response = middleware(request);
    expect(response.status).toBe(403);
    expect(getHeader(response, "X-Content-Type-Options")).toBe("nosniff");
    expect(getHeader(response, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
    const body = await response.json();
    expect(body.error).toContain("CSRF");
  });
});
