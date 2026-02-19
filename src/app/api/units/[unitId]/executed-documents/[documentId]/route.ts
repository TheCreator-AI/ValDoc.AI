import { fileToResponse } from "@/server/export/packageExporter";
import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

export async function GET(
  _request: Request,
  context: { params: Promise<{ unitId: string; documentId: string }> }
) {
  try {
    const session = await getSessionOrThrow();
    const { unitId, documentId } = await context.params;

    const document = await prisma.unitExecutedDocument.findFirst({
      where: {
        id: documentId,
        unitId,
        organizationId: session.organizationId
      }
    });

    if (!document) {
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: "document.download.executed.denied",
        entityType: "UnitExecutedDocument",
        entityId: documentId,
        outcome: "DENIED",
        details: { unitId, reason: "not_found_or_not_authorized" },
        request: _request
      });
      return apiJson(404, { error: "Executed unit document not found." });
    }

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "document.download.executed",
      entityType: "UnitExecutedDocument",
      entityId: document.id,
      details: { unitId, documentType: document.documentType, title: document.title },
      request: _request
    });

    return await fileToResponse(document.filePath, document.mimeType);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to download executed unit document." });
  }
}
