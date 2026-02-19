import { fileToResponse } from "@/server/export/packageExporter";
import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

export async function GET(
  _request: Request,
  context: { params: Promise<{ machineId: string; documentId: string }> }
) {
  try {
    const session = await getSessionOrThrow();
    const { machineId, documentId } = await context.params;

    const document = await prisma.machineVendorDocument.findFirst({
      where: {
        id: documentId,
        machineId,
        organizationId: session.organizationId
      }
    });

    if (!document) {
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: "document.download.vendor.denied",
        entityType: "MachineVendorDocument",
        entityId: documentId,
        outcome: "DENIED",
        details: { machineId, reason: "not_found_or_not_authorized" },
        request: _request
      });
      return apiJson(404, { error: "Vendor document not found." });
    }

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "document.download.vendor",
      entityType: "MachineVendorDocument",
      entityId: document.id,
      details: { machineId, title: document.title, documentType: document.documentType },
      request: _request
    });

    return await fileToResponse(document.filePath, document.mimeType);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to download vendor document." });
  }
}
