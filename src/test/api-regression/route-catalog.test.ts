/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { listApiRouteFiles } from "@/test/api-regression/route-catalog";

describe("api route catalog", () => {
  it("indexes all route handlers under src/app/api", () => {
    const routes = listApiRouteFiles();
    expect(routes.length).toBeGreaterThan(30);
    expect(routes).toContain("auth/login/route.ts");
    expect(routes).toContain("auth/me/route.ts");
    expect(routes).toContain("uploads/route.ts");
    expect(routes).toContain("admin/audit/verify-chain/route.ts");
  });
});
