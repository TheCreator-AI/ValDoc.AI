import { describe, expect, it } from "vitest";
import { getSecurityHeaders } from "@/server/security/headers";

describe("security headers", () => {
  it("returns hardened baseline headers", () => {
    const headers = getSecurityHeaders(true);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toContain("max-age");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("script-src");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("does not set HSTS in non-production mode", () => {
    const headers = getSecurityHeaders(false);
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });
});
