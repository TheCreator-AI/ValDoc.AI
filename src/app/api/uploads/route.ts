import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { ingestUpload } from "@/server/generation/uploadIngest";
import { writeAuditEvent } from "@/server/audit/events";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const data = await request.formData();
    const file = data.get("file");
    const machineId = String(data.get("machineId") ?? "");
    const sourceType = String(data.get("sourceType") ?? "MANUAL");

    if (!(file instanceof File)) {
      return apiJson(400, { error: "file is required." });
    }
    if (!machineId) {
      return apiJson(400, { error: "machineId is required." });
    }

    const result = await ingestUpload({
      organizationId: session.organizationId,
      machineId,
      userId: session.userId,
      file,
      sourceType
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "document.upload.source",
      entityType: "SourceDocument",
      entityId: result.sourceId,
      details: { machineId, sourceType, fileName: file.name },
      request
    });

    return apiJson(200, result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Upload ingestion failed." });
  }
}
