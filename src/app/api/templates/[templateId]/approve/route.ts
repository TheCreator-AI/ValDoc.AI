import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

export async function POST(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "templates.approve");
    const { templateId } = await context.params;

    const template = await prisma.documentTemplate.findFirst({
      where: { id: templateId, organizationId: session.organizationId }
    });
    if (!template) {
      return apiJson(404, { error: "Template not found." });
    }
    if (template.status === "RETIRED") {
      return apiJson(409, { error: "Retired template versions cannot be approved." });
    }

    const updated = await prisma.documentTemplate.update({
      where: { id: templateId },
      data: {
        isPrimary: true,
        templateKind: "PRIMARY",
        status: "APPROVED",
        approvedByUserId: session.userId,
        approvedAt: new Date(),
        effectiveDate: new Date()
      }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "template.approve",
      entityType: "DocumentTemplate",
      entityId: updated.id,
      details: { docType: updated.docType, title: updated.title, templateId: updated.templateId, version: updated.version },
      request
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to approve template." });
  }
}
