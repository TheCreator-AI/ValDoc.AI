import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, findFirst, update, createSession, compare, signSessionToken, writeAuditEvent } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  createSession: vi.fn(),
  compare: vi.fn(),
  signSessionToken: vi.fn(),
  writeAuditEvent: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    user: { findUnique, update },
    organization: { findFirst },
    userSession: { create: createSession },
    $executeRawUnsafe: vi.fn()
  }
}));

vi.mock("bcryptjs", () => ({
  compare
}));

vi.mock("@/server/auth/token", () => ({
  signSessionToken
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent
}));

vi.mock("@/server/auth/systemOwner", () => ({
  isSystemOwnerEmail: vi.fn((email: string) => email.toLowerCase() === "aphvaldoc@gmail.com")
}));

import { POST } from "./route";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditEvent.mockResolvedValue(undefined);
    findFirst.mockResolvedValue({ id: "org_qa", name: "QA Org", isActive: true });
    createSession.mockResolvedValue({ id: "sess_1" });
    update.mockResolvedValue(undefined);
  });

  it("returns 401 for invalid credentials", async () => {
    findUnique.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "org_qa", email: "x@y.com", password: "bad" })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });

  it("returns warning attempts remaining when <= 3", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "andrew@qa.org",
      organizationId: "org_qa",
      fullName: "Andrew",
      role: "ADMIN",
      userStatus: "ACTIVE",
      failedLoginAttempts: 7,
      passwordUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      mfaEnabled: true,
      passwordHash: "hash"
    });
    compare.mockResolvedValueOnce(false);

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org_qa", email: "andrew@qa.org", password: "wrong" })
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        attemptsRemaining: 2,
        lockoutThreshold: 10
      })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ failedLoginAttempts: 8 })
      })
    );
  });

  it("locks account on 10th failed attempt", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "andrew@qa.org",
      organizationId: "org_qa",
      fullName: "Andrew",
      role: "ADMIN",
      userStatus: "ACTIVE",
      failedLoginAttempts: 9,
      passwordUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      mfaEnabled: true,
      passwordHash: "hash"
    });
    compare.mockResolvedValueOnce(false);

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org_qa", email: "andrew@qa.org", password: "wrong" })
      })
    );

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        locked: true,
        attemptsRemaining: 0,
        lockoutThreshold: 10
      })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ failedLoginAttempts: 10, userStatus: "LOCKED" })
      })
    );
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.lockout", entityId: "u1" })
    );
  });

  it("denies locked users before password check", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "andrew@qa.org",
      organizationId: "org_qa",
      fullName: "Andrew",
      role: "ADMIN",
      userStatus: "LOCKED",
      failedLoginAttempts: 10,
      passwordUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      mfaEnabled: true,
      passwordHash: "hash"
    });

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org_qa", email: "andrew@qa.org", password: "Password123!" })
      })
    );

    expect(response.status).toBe(423);
    expect(compare).not.toHaveBeenCalled();
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.failed",
        outcome: "DENIED",
        details: expect.objectContaining({ reason: "user_locked" })
      })
    );
  });

  it("rejects expired passwords after 180 days", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "andrew@qa.org",
      organizationId: "org_qa",
      fullName: "Andrew",
      role: "ADMIN",
      userStatus: "ACTIVE",
      failedLoginAttempts: 0,
      passwordUpdatedAt: new Date("2025-01-01T00:00:00.000Z"),
      mfaEnabled: true,
      passwordHash: "hash"
    });

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org_qa", email: "andrew@qa.org", password: "Password123!" })
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        passwordExpired: true,
        passwordMaxAgeDays: 180
      })
    );
    expect(compare).not.toHaveBeenCalled();
  });

  it("enforces optional MFA for admin when configured", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.REQUIRE_ADMIN_MFA;
    env.REQUIRE_ADMIN_MFA = "true";

    findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "andrew@qa.org",
      organizationId: "org_qa",
      fullName: "Andrew",
      role: "ADMIN",
      userStatus: "ACTIVE",
      failedLoginAttempts: 0,
      passwordUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      mfaEnabled: false,
      passwordHash: "hash"
    });

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org_qa", email: "andrew@qa.org", password: "Password123!" })
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ mfaRequired: true }));

    env.REQUIRE_ADMIN_MFA = previous;
  });

  it("returns user and sets cookie for valid credentials", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "andrew@qa.org",
      organizationId: "org_qa",
      fullName: "Andrew",
      role: "ADMIN",
      userStatus: "ACTIVE",
      failedLoginAttempts: 2,
      passwordUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      mfaEnabled: true,
      passwordHash: "hash"
    });
    compare.mockResolvedValueOnce(true);
    signSessionToken.mockResolvedValueOnce("signed-token");

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "org_qa", email: "andrew@qa.org", password: "Password123!" })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("valdoc_token=signed-token");
    expect(createSession).toHaveBeenCalled();
    expect(signSessionToken).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sess_1" }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ failedLoginAttempts: 0 })
      })
    );
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.success",
        entityId: "u1"
      })
    );
  });

  it("sets secure cookie attributes in production", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    env.NODE_ENV = "production";
    findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "andrew@qa.org",
      organizationId: "org_qa",
      fullName: "Andrew",
      role: "ADMIN",
      userStatus: "ACTIVE",
      failedLoginAttempts: 0,
      passwordUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      mfaEnabled: true,
      passwordHash: "hash"
    });
    compare.mockResolvedValueOnce(true);
    signSessionToken.mockResolvedValueOnce("signed-token");

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org_qa", email: "andrew@qa.org", password: "Password123!" })
      })
    );

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");

    env.NODE_ENV = previous;
  });

  it("returns 400 when organization is not provided", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "andrew@qa.org", password: "Password123!" })
      })
    );
    expect(response.status).toBe(400);
  });

  it("denies login when organization does not match user", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "andrew@qa.org",
      organizationId: "org_qa",
      fullName: "Andrew",
      role: "ADMIN",
      userStatus: "ACTIVE",
      failedLoginAttempts: 0,
      passwordUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      mfaEnabled: true,
      passwordHash: "hash"
    });
    compare.mockResolvedValueOnce(true);

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org_other", email: "andrew@qa.org", password: "Password123!" })
      })
    );

    expect(response.status).toBe(403);
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.failed",
        outcome: "DENIED"
      })
    );
  });

  it("allows system owner master admin to login to selected organization", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u-master",
      email: "aphvaldoc@gmail.com",
      organizationId: "org_qa",
      fullName: "Platform Admin",
      role: "ADMIN",
      userStatus: "ACTIVE",
      failedLoginAttempts: 0,
      passwordUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      mfaEnabled: true,
      passwordHash: "hash"
    });
    compare.mockResolvedValueOnce(true);
    signSessionToken.mockResolvedValueOnce("signed-token");
    findFirst.mockResolvedValueOnce({ id: "org_amnion", name: "Amnion", isActive: true });

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "org_amnion", email: "aphvaldoc@gmail.com", password: "Password123!" })
      })
    );

    expect(response.status).toBe(200);
    expect(signSessionToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-master",
        organizationId: "org_amnion"
      })
    );
  });
});
