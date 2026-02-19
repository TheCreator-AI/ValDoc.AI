import { prisma } from "@/server/db/prisma";
import { saveUploadedFile } from "@/server/files/storage";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow();
    const { machineId } = await context.params;

    const machine = await prisma.machine.findFirst({
      where: {
        id: machineId,
        organizationId: session.organizationId
      }
    });

    if (!machine) {
      return apiJson(404, { error: "Machine not found." });
    }

    const docs = await prisma.machineVendorDocument.findMany({
      where: {
        machineId,
        organizationId: session.organizationId
      },
      orderBy: { createdAt: "desc" }
    });

    return apiJson(200, docs);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to list vendor documents." });
  }
}

export async function POST(request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { machineId } = await context.params;

    const machine = await prisma.machine.findFirst({
      where: {
        id: machineId,
        organizationId: session.organizationId
      }
    });

    if (!machine) {
      return apiJson(404, { error: "Machine not found." });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const title = String(formData.get("title") ?? "").trim();
    const documentType = String(formData.get("documentType") ?? "VENDOR_REFERENCE").trim();

    if (!(file instanceof File)) {
      return apiJson(400, { error: "file is required." });
    }

    const stored = await saveUploadedFile(file, { kind: "VENDOR_DOCUMENT" });

    const created = await prisma.machineVendorDocument.create({
      data: {
        organizationId: session.organizationId,
        machineId,
        title: title || stored.fileName,
        documentType,
        fileName: stored.fileName,
        filePath: stored.filePath,
        mimeType: stored.mimeType
      }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "document.upload.vendor",
      entityType: "MachineVendorDocument",
      entityId: created.id,
      details: { machineId, title: created.title, documentType: created.documentType },
      request
    });

    return apiJson(201, created);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to upload vendor document." });
  }
}
