import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { assertSystemOwnerOrThrow } from "@/server/auth/systemOwner";
import { writeAuditEvent } from "@/server/audit/events";

export async function DELETE(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    assertSystemOwnerOrThrow(session.email);
    const { organizationId } = await context.params;

    if (organizationId === session.organizationId) {
      return apiJson(400, { error: "You cannot delete your current organization." });
    }

    const existing = await prisma.organization.findFirst({
      where: { id: organizationId, isActive: true },
      select: { id: true, name: true }
    });
    if (!existing) {
      return apiJson(404, { error: "Organization not found." });
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: { isActive: false }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "organization.delete",
      entityType: "Organization",
      entityId: organizationId,
      details: { name: existing.name, mode: "soft_delete" },
      request
    });

    return apiJson(200, { ok: true });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to delete organization." });
  }
}

