import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  verifySessionToken: vi.fn(),
  organizationFindFirst: vi.fn(),
  userSessionFindFirst: vi.fn(),
  userSessionUpdate: vi.fn(),
  userFindFirst: vi.fn(),
  writeAuditEvent: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookiesGet }))
}));

vi.mock("@/server/auth/token", () => ({
  verifySessionToken: mocks.verifySessionToken
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    organization: { findFirst: mocks.organizationFindFirst },
    userSession: { findFirst: mocks.userSessionFindFirst, update: mocks.userSessionUpdate },
    user: { findFirst: mocks.userFindFirst },
    $executeRawUnsafe: vi.fn()
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { ApiError, getSessionOrThrow } from "./http";

describe("getSessionOrThrow session controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookiesGet.mockReturnValue({ value: "token" });
    mocks.verifySessionToken.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN",
      email: "admin@org.com",
      sessionId: "sess1"
    });
    mocks.organizationFindFirst.mockResolvedValue({ id: "org1" });
    mocks.userFindFirst.mockResolvedValue({ id: "u1", userStatus: "ACTIVE" });
    mocks.userSessionFindFirst.mockResolvedValue({
      id: "sess1",
      organizationId: "org1",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastActivityAt: new Date(),
      idleTimeoutSeconds: 1800
    });
    mocks.userSessionUpdate.mockResolvedValue({ id: "sess1" });
    mocks.writeAuditEvent.mockResolvedValue(undefined);
  });

  it("rejects expired sessions", async () => {
    mocks.userSessionFindFirst.mockResolvedValueOnce({
      id: "sess1",
      organizationId: "org1",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 5_000),
      lastActivityAt: new Date(),
      idleTimeoutSeconds: 1800
    });

    const sessionPromise = getSessionOrThrow();
    await expect(sessionPromise).rejects.toBeInstanceOf(ApiError);
    await expect(sessionPromise).rejects.toMatchObject({ status: 401 });
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.session.expired" }));
  });

  it("rejects idle-timed-out sessions", async () => {
    mocks.userSessionFindFirst.mockResolvedValueOnce({
      id: "sess1",
      organizationId: "org1",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastActivityAt: new Date(Date.now() - 31 * 60 * 1000),
      idleTimeoutSeconds: 1800
    });

    await expect(getSessionOrThrow()).rejects.toMatchObject({ status: 401 });
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.session.idle_timeout" }));
  });

  it("accepts active sessions and updates activity timestamp", async () => {
    const session = await getSessionOrThrow();
    expect(session.userId).toBe("u1");
    expect(mocks.userSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sess1" }, data: { lastActivityAt: expect.any(Date) } })
    );
  });

  it("rejects revoked sessions", async () => {
    mocks.userSessionFindFirst.mockResolvedValueOnce(null);

    await expect(getSessionOrThrow()).rejects.toMatchObject({ status: 401 });
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.session.invalid" }));
  });
});
