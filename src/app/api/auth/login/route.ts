import { compare } from "bcryptjs";
import { prisma } from "@/server/db/prisma";
import { signSessionToken } from "@/server/auth/token";
import { buildSessionCookieHeader } from "@/server/auth/cookie";
import { apiJson } from "@/server/api/http";
import { ensureDatabaseInitialized } from "@/server/db/bootstrap";
import { writeAuditEvent } from "@/server/audit/events";
import { isSystemOwnerEmail } from "@/server/auth/systemOwner";
import { getAuthPolicy } from "@/server/auth/policy";
import { checkAndConsumeRateLimit } from "@/server/security/rateLimit";
import { runWithoutOrgScope } from "@/server/db/org-scope-context";

const getClientIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
};

const isPasswordExpired = (passwordUpdatedAt: Date | null, maxAgeDays: number) => {
  const updatedAt = passwordUpdatedAt ?? new Date(0);
  const ageMs = Date.now() - updatedAt.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
};

export async function POST(request: Request) {
  return await runWithoutOrgScope(async () => {
    await ensureDatabaseInitialized();
    const body = (await request.json()) as { organizationId?: string; email?: string; password?: string };
    const authPolicy = getAuthPolicy();

  if (!body.organizationId || !body.email || !body.password) {
    return apiJson(400, { error: "Organization, email, and password are required." });
  }

  const clientIp = getClientIp(request) ?? "unknown";
  const rateLimit = checkAndConsumeRateLimit({
    key: `auth:login:${clientIp}:${body.email.toLowerCase()}`,
    limit: 12,
    windowMs: 5 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Too many login attempts. Please retry later." }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rateLimit.retryAfterSeconds)
      }
    });
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) {
    return apiJson(401, { error: "Invalid credentials." });
  }

  let targetOrganization = await prisma.organization.findFirst({
    where: { id: body.organizationId, isActive: true },
    select: { id: true, name: true }
  });
  if (!targetOrganization) {
    const customerId = (process.env.CUSTOMER_ID ?? "").trim();
    const orgName = (process.env.ORG_NAME ?? "").trim();
    if (customerId && orgName && body.organizationId === customerId) {
      targetOrganization = await prisma.organization.upsert({
        where: { id: customerId },
        update: { name: orgName, isActive: true },
        create: { id: customerId, name: orgName, isActive: true },
        select: { id: true, name: true }
      });
    }
  }
  if (!targetOrganization) {
    return apiJson(404, { error: "Selected organization was not found or is inactive." });
  }

  const isMasterAdmin = user.role === "ADMIN" && isSystemOwnerEmail(user.email);
  if (!isMasterAdmin && user.organizationId !== body.organizationId) {
    await writeAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "auth.login.failed",
      entityType: "User",
      entityId: user.id,
      outcome: "DENIED",
      details: { reason: "organization_mismatch", email: user.email, organizationId: body.organizationId },
      request
    }).catch(() => undefined);
    return apiJson(403, { error: "User does not belong to the selected organization." });
  }

  if (user.userStatus === "LOCKED") {
    await writeAuditEvent({
      organizationId: body.organizationId,
      actorUserId: user.id,
      action: "auth.login.failed",
      entityType: "User",
      entityId: user.id,
      outcome: "DENIED",
      details: { reason: "user_locked", email: user.email },
      request
    }).catch(() => undefined);
    return apiJson(423, {
      error: "Account is locked. Contact an administrator to unlock.",
      locked: true,
      attemptsRemaining: 0,
      lockoutThreshold: authPolicy.lockoutThreshold
    });
  }

  if (isPasswordExpired(user.passwordUpdatedAt ?? user.createdAt, authPolicy.passwordMaxAgeDays)) {
    await writeAuditEvent({
      organizationId: body.organizationId,
      actorUserId: user.id,
      action: "auth.login.failed",
      entityType: "User",
      entityId: user.id,
      outcome: "DENIED",
      details: { reason: "password_expired", email: user.email, passwordMaxAgeDays: authPolicy.passwordMaxAgeDays },
      request
    }).catch(() => undefined);
    return apiJson(403, {
      error: "Password expired. Reset your password before signing in.",
      passwordExpired: true,
      passwordMaxAgeDays: authPolicy.passwordMaxAgeDays
    });
  }

  const privilegedRoles = new Set(["ADMIN", "APPROVER", "REVIEWER"]);
  if (authPolicy.requirePrivilegedMfa && privilegedRoles.has(user.role) && !user.mfaEnabled) {
    await writeAuditEvent({
      organizationId: body.organizationId,
      actorUserId: user.id,
      action: "auth.login.failed",
      entityType: "User",
      entityId: user.id,
      outcome: "DENIED",
      details: { reason: "privileged_mfa_required", email: user.email, role: user.role },
      request
    }).catch(() => undefined);
    return apiJson(403, {
      error: "MFA is required for privileged roles in this deployment.",
      mfaRequired: true
    });
  }

  if (authPolicy.requireAdminMfa && user.role === "ADMIN" && !user.mfaEnabled) {
    await writeAuditEvent({
      organizationId: body.organizationId,
      actorUserId: user.id,
      action: "auth.login.failed",
      entityType: "User",
      entityId: user.id,
      outcome: "DENIED",
      details: { reason: "admin_mfa_required", email: user.email },
      request
    }).catch(() => undefined);
    return apiJson(403, {
      error: "Admin MFA is required for this deployment.",
      mfaRequired: true
    });
  }

  const valid = await compare(body.password, user.passwordHash);
  if (!valid) {
    const nextFailedAttempts = (user.failedLoginAttempts ?? 0) + 1;
    const attemptsRemaining = Math.max(0, authPolicy.lockoutThreshold - nextFailedAttempts);
    const isLocking = nextFailedAttempts >= authPolicy.lockoutThreshold;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: nextFailedAttempts,
        ...(isLocking ? { userStatus: "LOCKED", lockedAt: new Date() } : {})
      }
    }).catch(() => undefined);

    await writeAuditEvent({
      organizationId: body.organizationId,
      actorUserId: user.id,
      action: "auth.login.failed",
      entityType: "User",
      entityId: user.id,
      outcome: "DENIED",
      details: {
        reason: "invalid_password",
        email: user.email,
        failedLoginAttempts: nextFailedAttempts,
        attemptsRemaining,
        lockoutThreshold: authPolicy.lockoutThreshold
      },
      request
    }).catch(() => undefined);

    if (isLocking) {
      await writeAuditEvent({
        organizationId: body.organizationId,
        actorUserId: user.id,
        action: "auth.lockout",
        entityType: "User",
        entityId: user.id,
        outcome: "SUCCESS",
        details: { email: user.email, failedLoginAttempts: nextFailedAttempts, lockoutThreshold: authPolicy.lockoutThreshold },
        request
      }).catch(() => undefined);
      return apiJson(423, {
        error: "Account locked after too many failed attempts. Contact an administrator.",
        locked: true,
        attemptsRemaining: 0,
        lockoutThreshold: authPolicy.lockoutThreshold
      });
    }

    return apiJson(401, {
      error: "Invalid credentials.",
      attemptsRemaining,
      lockoutThreshold: authPolicy.lockoutThreshold
    });
  }

  const now = new Date();
  const session = await prisma.userSession.create({
    data: {
      organizationId: body.organizationId,
      userId: user.id,
      expiresAt: new Date(now.getTime() + authPolicy.sessionMaxAgeSeconds * 1000),
      lastActivityAt: now,
      idleTimeoutSeconds: authPolicy.idleTimeoutSeconds,
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent")
    },
    select: { id: true }
  });

  const token = await signSessionToken({
    userId: user.id,
    organizationId: body.organizationId,
    role: user.role,
    email: user.email,
    sessionId: session.id
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: now,
      failedLoginAttempts: 0,
      lockedAt: null
    }
  }).catch(() => undefined);

  await writeAuditEvent({
    organizationId: body.organizationId,
    actorUserId: user.id,
    action: "auth.login.success",
    entityType: "User",
    entityId: user.id,
    details: { email: user.email, sessionId: session.id },
    request
  }).catch(() => undefined);

    return new Response(
      JSON.stringify({
        user: {
          id: user.id,
          organizationId: body.organizationId,
          role: user.role,
          email: user.email,
          fullName: user.fullName
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": buildSessionCookieHeader({ token, maxAgeSeconds: authPolicy.sessionMaxAgeSeconds })
        }
      }
    );
  });
}
