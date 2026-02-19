import { Role } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "users.manage_roles");
    const { userId } = await context.params;
    const body = (await request.json()) as { role?: Role };
    const supportedRoles: Role[] = ["ADMIN", "USER", "REVIEWER", "APPROVER"];
    if (!body.role || !supportedRoles.includes(body.role)) {
      return apiJson(400, { error: "Valid role is required (ADMIN, USER, REVIEWER, APPROVER)." });
    }

    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: session.organizationId }
    });
    if (!target) {
      return apiJson(404, { error: "User not found." });
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { role: body.role },
      select: { id: true, email: true, fullName: true, role: true }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "auth.role_change",
      entityType: "User",
      entityId: updated.id,
      details: { previousRole: target.role, updatedRole: updated.role, email: updated.email },
      request
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to update role." });
  }
}
