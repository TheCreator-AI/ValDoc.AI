import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { ingestUpload } from "@/server/generation/uploadIngest";
import { writeAuditEvent } from "@/server/audit/events";
import { checkAndConsumeRateLimit } from "@/server/security/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let sessionRef: { organizationId: string; userId: string } | null = null;
  let machineIdRef = "";
  let sourceTypeRef = "MANUAL";
  let fileNameRef = "";
  try {
    const session = await getSessionOrThrow("ENGINEER");
    sessionRef = { organizationId: session.organizationId, userId: session.userId };
    const rateLimit = checkAndConsumeRateLimit({
      key: `upload:${session.organizationId}:${session.userId}`,
      limit: 60,
      windowMs: 10 * 60 * 1000
    });
    if (!rateLimit.allowed) {
      return apiJson(429, { error: "Upload rate limit exceeded. Please retry later." });
    }
    const data = await request.formData();
    const file = data.get("file");
    const machineId = String(data.get("machineId") ?? "");
    const sourceType = String(data.get("sourceType") ?? "MANUAL");
    machineIdRef = machineId;
    sourceTypeRef = sourceType;

    if (!(file instanceof File)) {
      return apiJson(400, { error: "file is required." });
    }
    fileNameRef = file.name;
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
      if (sessionRef) {
        try {
          await writeAuditEvent({
            organizationId: sessionRef.organizationId,
            actorUserId: sessionRef.userId,
            action: "document.upload.source",
            entityType: "SourceDocument",
            entityId: machineIdRef || "unknown",
            outcome: "DENIED",
            details: {
              machineId: machineIdRef || null,
              sourceType: sourceTypeRef,
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
    return apiJson(500, { error: "Upload ingestion failed." });
  }
}
