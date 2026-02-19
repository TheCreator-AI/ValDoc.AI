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
