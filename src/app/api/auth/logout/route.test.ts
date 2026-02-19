import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-012345678901234567890";
process.env.CUSTOMER_ID = process.env.CUSTOMER_ID ?? "qa-org";
process.env.ORG_NAME = process.env.ORG_NAME ?? "QA Organization";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  writeAuditEvent: vi.fn(),
  verifySessionToken: vi.fn()
}));

vi.mock("@/server/auth/token", () => ({
  verifySessionToken: mocks.verifySessionToken,
  signSessionToken: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  return {
    apiJson: (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
      }),
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("writes logout audit event when session exists", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN",
      email: "andrew@qa.org"
    });

    const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.logout",
        entityType: "User",
        entityId: "u1"
      })
    );
  });

  it("sets secure cookie attributes in production", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    env.NODE_ENV = "production";
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN",
      email: "andrew@qa.org"
    });

    const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");

    env.NODE_ENV = previous;
  });
});
