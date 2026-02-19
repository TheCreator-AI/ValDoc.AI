import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";

export async function GET(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "templates.read");
    const { templateId } = await context.params;

    const current = await prisma.documentTemplate.findFirst({
      where: { id: templateId, organizationId: session.organizationId }
    });
    if (!current) {
      return apiJson(404, { error: "Template not found." });
    }

    const versions = await prisma.documentTemplate.findMany({
      where: {
        organizationId: session.organizationId,
        templateId: current.templateId
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }]
    });

    return apiJson(200, {
      templateId: current.templateId,
      docType: current.docType,
      versions
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to load template history." });
  }
}
