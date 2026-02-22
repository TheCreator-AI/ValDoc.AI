import { describe, expect, it } from "vitest";
import { isUnsafeMethod, isSameOriginRequestAllowed } from "@/server/security/csrf";

describe("csrf/origin guard", () => {
  it("identifies unsafe methods", () => {
    expect(isUnsafeMethod("GET")).toBe(false);
    expect(isUnsafeMethod("POST")).toBe(true);
    expect(isUnsafeMethod("PATCH")).toBe(true);
  });

  it("allows same-origin unsafe requests with matching origin", () => {
    expect(
      isSameOriginRequestAllowed({
        method: "POST",
        host: "localhost:3000",
        origin: "http://localhost:3000",
        referer: null
      })
    ).toBe(true);
  });

  it("blocks cross-origin unsafe requests", () => {
    expect(
      isSameOriginRequestAllowed({
        method: "POST",
        host: "localhost:3000",
        origin: "https://evil.example.com",
        referer: null
      })
    ).toBe(false);
  });
});
