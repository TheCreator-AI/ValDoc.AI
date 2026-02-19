import { cookies } from "next/headers";
import { verifySessionToken } from "@/server/auth/token";
import { hasPermission, hasRole, type Permission, type Role } from "@/server/auth/rbac";
import { ensureDatabaseInitialized } from "@/server/db/bootstrap";
import { prisma } from "@/server/db/prisma";
import { writeAuditEvent } from "@/server/audit/events";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const auditSessionFailure = async (params: {
  organizationId: string;
  actorUserId: string;
  action: string;
  sessionId?: string;
}) => {
  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: "UserSession",
    entityId: params.sessionId ?? params.actorUserId,
    outcome: "DENIED",
    details: { sessionId: params.sessionId }
  }).catch(() => undefined);
};

export const getSessionOrThrow = async (minimumRole?: Role) => {
  await ensureDatabaseInitialized();
  const cookieStore = await cookies();
  const token = cookieStore.get("valdoc_token")?.value;

  if (!token) {
    throw new ApiError(401, "Authentication required.");
  }

  const session = await verifySessionToken(token);
  const organization = await prisma.organization.findFirst({
    where: { id: session.organizationId, isActive: true },
    select: { id: true }
  });
  if (!organization) {
    throw new ApiError(403, "Session organization is not active for this deployment.");
  }

  if (!session.sessionId) {
    throw new ApiError(401, "Session is invalid. Please sign in again.");
  }

  const userSession = await prisma.userSession.findFirst({
    where: {
      id: session.sessionId,
      organizationId: session.organizationId,
      userId: session.userId,
      revokedAt: null
    },
    select: {
      id: true,
      expiresAt: true,
      lastActivityAt: true,
      idleTimeoutSeconds: true
    }
  });

  if (!userSession) {
    await auditSessionFailure({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "auth.session.invalid",
      sessionId: session.sessionId
    });
    throw new ApiError(401, "Session has ended. Please sign in again.");
  }

  const now = new Date();

  if (userSession.expiresAt.getTime() <= now.getTime()) {
    await prisma.userSession.update({
      where: { id: userSession.id },
      data: { revokedAt: now }
    }).catch(() => undefined);
    await auditSessionFailure({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "auth.session.expired",
      sessionId: session.sessionId
    });
    throw new ApiError(401, "Session expired. Please sign in again.");
  }

  const idleSeconds = Math.floor((now.getTime() - userSession.lastActivityAt.getTime()) / 1000);
  if (idleSeconds > userSession.idleTimeoutSeconds) {
    await prisma.userSession.update({
      where: { id: userSession.id },
      data: { revokedAt: now }
    }).catch(() => undefined);
    await auditSessionFailure({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "auth.session.idle_timeout",
      sessionId: session.sessionId
    });
    throw new ApiError(401, "Session timed out due to inactivity. Please sign in again.");
  }

  const account = await prisma.user.findFirst({
    where: { id: session.userId, organizationId: session.organizationId },
    select: { userStatus: true }
  });
  if (!account || account.userStatus === "LOCKED") {
    await auditSessionFailure({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "auth.session.locked",
      sessionId: session.sessionId
    });
    throw new ApiError(403, "Account is locked.");
  }

  await prisma.userSession.update({
    where: { id: userSession.id },
    data: { lastActivityAt: now }
  }).catch(() => undefined);

  if (minimumRole && !hasRole(session.role, minimumRole)) {
    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "authz.denied",
      entityType: "Role",
      entityId: minimumRole,
      outcome: "DENIED",
      details: { role: session.role, minimumRole }
    });
    throw new ApiError(403, "Insufficient permissions.");
  }

  return session;
};

export const assertPermissionOrThrow = async (params: {
  session: { userId: string; organizationId: string; role: Role };
  permission: Permission;
  request: Request;
}) => {
  if (!hasPermission(params.session.role, params.permission)) {
    await writeAuditEvent({
      organizationId: params.session.organizationId,
      actorUserId: params.session.userId,
      action: "authz.denied",
      entityType: "Permission",
      entityId: params.permission,
      outcome: "DENIED",
      details: { role: params.session.role, permission: params.permission },
      request: params.request
    });
    throw new ApiError(403, "Insufficient permissions.");
  }
};

export const getSessionOrThrowWithPermission = async (request: Request, permission: Permission) => {
  const session = await getSessionOrThrow();
  await assertPermissionOrThrow({ session, permission, request });
  return session;
};

export const apiJson = (status: number, body: unknown) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
};
