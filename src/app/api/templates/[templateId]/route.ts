import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "templates.update");
    const { templateId } = await context.params;
    const body = (await request.json()) as { title?: string; contentTemplate?: string };

    const existing = await prisma.documentTemplate.findFirst({
      where: {
        id: templateId,
        organizationId: session.organizationId
      }
    });
    if (!existing) {
      return apiJson(404, { error: "Template not found." });
    }

    const familyVersions = await prisma.documentTemplate.findMany({
      where: {
        organizationId: session.organizationId,
        templateId: existing.templateId
      },
      select: { version: true },
      orderBy: { version: "desc" },
      take: 1
    });
    const nextVersion = (familyVersions[0]?.version ?? existing.version ?? 1) + 1;

    const updated = await prisma.documentTemplate.create({
      data: {
        organizationId: session.organizationId,
        templateId: existing.templateId,
        version: nextVersion,
        status: "DRAFT",
        createdByUserId: session.userId,
        docType: existing.docType,
        title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : existing.title,
        contentTemplate:
          typeof body.contentTemplate === "string" && body.contentTemplate.trim()
            ? body.contentTemplate
            : existing.contentTemplate,
        templateKind: existing.templateKind,
        isPrimary: false,
        sourceFileName: existing.sourceFileName,
        sourceFilePath: existing.sourceFilePath,
        sourceMimeType: existing.sourceMimeType
      }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "template.update",
      entityType: "DocumentTemplate",
      entityId: updated.id,
      details: { title: updated.title, previousVersion: existing.version, newVersion: updated.version, templateId: existing.templateId },
      request
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to update template." });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const session = await getSessionOrThrowWithPermission(_request, "templates.delete");
    const { templateId } = await context.params;

    const template = await prisma.documentTemplate.findFirst({
      where: {
        id: templateId,
        organizationId: session.organizationId
      }
    });

    if (!template) {
      return apiJson(404, { error: "Template not found." });
    }

    const retired = await prisma.documentTemplate.update({
      where: { id: template.id },
      data: {
        status: "RETIRED",
        isPrimary: false
      }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "template.retire",
      entityType: "DocumentTemplate",
      entityId: template.id,
      details: { docType: template.docType, title: template.title, templateId: template.templateId, version: template.version },
      request: _request
    });

    return apiJson(200, { retired: true, templateId: retired.id, status: retired.status });
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to retire template." });
  }
}
