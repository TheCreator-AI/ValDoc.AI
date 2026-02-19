import { compare } from "bcryptjs";
import { prisma } from "@/server/db/prisma";
import { signSessionToken } from "@/server/auth/token";
import { buildSessionCookieHeader } from "@/server/auth/cookie";
import { apiJson } from "@/server/api/http";
import { ensureDatabaseInitialized } from "@/server/db/bootstrap";
import { writeAuditEvent } from "@/server/audit/events";
import { isSystemOwnerEmail } from "@/server/auth/systemOwner";

export async function POST(request: Request) {
  await ensureDatabaseInitialized();
  const body = (await request.json()) as { organizationId?: string; email?: string; password?: string };

  if (!body.organizationId || !body.email || !body.password) {
    return apiJson(400, { error: "Organization, email, and password are required." });
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) {
    return apiJson(401, { error: "Invalid credentials." });
  }

  const targetOrganization = await prisma.organization.findFirst({
    where: { id: body.organizationId, isActive: true },
    select: { id: true, name: true }
  });
  if (!targetOrganization) {
    return apiJson(404, { error: "Selected organization was not found or is inactive." });
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
    return apiJson(403, { error: "Account is locked. Contact an administrator." });
  }

  const valid = await compare(body.password, user.passwordHash);
  if (!valid) {
    await writeAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "auth.login.failed",
      entityType: "User",
      entityId: user.id,
      outcome: "DENIED",
      details: { reason: "invalid_password", email: user.email },
      request
    }).catch(() => undefined);
    return apiJson(401, { error: "Invalid credentials." });
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

  const token = await signSessionToken({
    userId: user.id,
    organizationId: body.organizationId,
    role: user.role,
    email: user.email
  });

  await writeAuditEvent({
    organizationId: body.organizationId,
    actorUserId: user.id,
    action: "auth.login.success",
    entityType: "User",
    entityId: user.id,
      details: { email: user.email },
      request
  }).catch(() => undefined);

  const prismaWithOptionalUpdate = prisma as typeof prisma & {
    user: typeof prisma.user & {
      update?: (args: { where: { id: string }; data: { lastLoginAt: Date } }) => Promise<unknown>;
    };
  };

  if (typeof prismaWithOptionalUpdate.user.update === "function") {
    await prismaWithOptionalUpdate.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    }).catch(() => undefined);
  }

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
        "Set-Cookie": buildSessionCookieHeader({
          token,
          maxAgeSeconds: 28800
        })
      }
    }
  );
}