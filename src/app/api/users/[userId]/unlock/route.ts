import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "users.manage_roles");
    const { userId } = await context.params;

    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: session.organizationId },
      select: { id: true, email: true, userStatus: true, failedLoginAttempts: true }
    });
    if (!target) {
      return apiJson(404, { error: "User not found." });
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        userStatus: "ACTIVE",
        failedLoginAttempts: 0,
        lockedAt: null
      },
      select: { id: true, email: true, userStatus: true, failedLoginAttempts: true }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "auth.unlock",
      entityType: "User",
      entityId: updated.id,
      details: {
        email: updated.email,
        previousStatus: target.userStatus,
        previousFailedLoginAttempts: target.failedLoginAttempts
      },
      request
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to unlock user." });
  }
}
