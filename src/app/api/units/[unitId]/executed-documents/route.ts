import { ExecutedDocumentType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { saveUploadedFile } from "@/server/files/storage";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

export const runtime = "nodejs";

const toExecutedType = (value: string): ExecutedDocumentType => {
  if (Object.values(ExecutedDocumentType).includes(value as ExecutedDocumentType)) {
    return value as ExecutedDocumentType;
  }
  return ExecutedDocumentType.OTHER;
};

export async function GET(_request: Request, context: { params: Promise<{ unitId: string }> }) {
  try {
    const session = await getSessionOrThrow();
    const { unitId } = await context.params;

    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        organizationId: session.organizationId
      }
    });

    if (!unit) {
      return apiJson(404, { error: "Unit not found." });
    }

    const docs = await prisma.unitExecutedDocument.findMany({
      where: {
        unitId,
        organizationId: session.organizationId
      },
      orderBy: { createdAt: "desc" }
    });

    return apiJson(200, docs);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    const details = error instanceof Error ? error.message : "Unknown error";
    return apiJson(500, { error: `Failed to list executed unit documents. ${details}` });
  }
}

export async function POST(request: Request, context: { params: Promise<{ unitId: string }> }) {
  let sessionRef: { organizationId: string; userId: string } | null = null;
  let unitIdRef = "";
  let titleRef = "";
  let documentTypeRef = "OTHER";
  let fileNameRef = "";
  try {
    const session = await getSessionOrThrow("ENGINEER");
    sessionRef = { organizationId: session.organizationId, userId: session.userId };
    const { unitId } = await context.params;
    unitIdRef = unitId;

    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        organizationId: session.organizationId
      }
    });

    if (!unit) {
      return apiJson(404, { error: "Unit not found." });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const title = String(formData.get("title") ?? "").trim();
    const documentTypeRaw = String(formData.get("documentType") ?? "OTHER").trim();
    titleRef = title;
    documentTypeRef = documentTypeRaw;

    if (!(file instanceof File)) {
      return apiJson(400, { error: "file is required." });
    }
    fileNameRef = file.name;

    const stored = await saveUploadedFile(file, { kind: "EXECUTED_DOCUMENT" });

    const created = await prisma.unitExecutedDocument.create({
      data: {
        organizationId: session.organizationId,
        unitId,
        title: title || stored.fileName,
        documentType: toExecutedType(documentTypeRaw),
        fileName: stored.fileName,
        filePath: stored.filePath,
        mimeType: stored.mimeType
      }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "document.upload.executed",
      entityType: "UnitExecutedDocument",
      entityId: created.id,
      details: { unitId, title: created.title, documentType: created.documentType },
      request
    });

    return apiJson(201, created);
  } catch (error) {
    if (error instanceof ApiError) {
      if (sessionRef) {
        try {
          await writeAuditEvent({
            organizationId: sessionRef.organizationId,
            actorUserId: sessionRef.userId,
            action: "document.upload.executed",
            entityType: "UnitExecutedDocument",
            entityId: unitIdRef || "unknown",
            outcome: "DENIED",
            details: {
              unitId: unitIdRef || null,
              title: titleRef || null,
              documentType: documentTypeRef,
              fileName: fileNameRef || null,
              reason: error.message
            },
            request
          });
        } catch {
          // swallow audit failures for response path
        }
      }
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Unknown error";
    return apiJson(500, { error: `Failed to upload executed unit document. ${details}` });
  }
}
