import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";
import { ensureStoragePathIsSafe } from "@/server/files/storage";

export const runtime = "nodejs";

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

const asInlineFileResponse = async (filePath: string, contentType: string, fileName: string) => {
  ensureStoragePathIsSafe(filePath);
  const stat = await fs.promises.stat(filePath);
  const stream = fs.createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${safeFileName(fileName)}"`,
      "X-Content-Type-Options": "nosniff"
    }
  });
};

export async function GET(_request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const session = await getSessionOrThrow();
    const { templateId } = await context.params;

    const template = await prisma.documentTemplate.findFirst({
      where: {
        id: templateId,
        organizationId: session.organizationId
      }
    });

    if (!template) {
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: "template.download.denied",
        entityType: "DocumentTemplate",
        entityId: templateId,
        outcome: "DENIED",
        details: { reason: "not_found_or_not_authorized" },
        request: _request
      });
      return apiJson(404, { error: "Template not found." });
    }

    if (template.sourceFilePath && template.sourceMimeType) {
      const fileName = template.sourceFileName ?? path.basename(template.sourceFilePath);
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: "template.download",
        entityType: "DocumentTemplate",
        entityId: template.id,
        details: { fileName, mimeType: template.sourceMimeType },
        request: _request
      });
      return await asInlineFileResponse(
        template.sourceFilePath,
        template.sourceMimeType,
        fileName
      );
    }

    return apiJson(404, {
      error: "No uploaded file is attached to this template. Upload a PDF or Word file first."
    });
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    const details = error instanceof Error ? error.message : "Unknown error";
    return apiJson(500, { error: `Failed to download template file. ${details}` });
  }
}
