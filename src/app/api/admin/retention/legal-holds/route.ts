import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { createLegalHold, listLegalHolds } from "@/server/retention/service";

export async function GET() {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const holds = await listLegalHolds(session.organizationId);
    return apiJson(200, holds);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to load legal holds." });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const body = (await request.json().catch(() => ({}))) as {
      recordType?: string;
      recordId?: string;
      recordVersionId?: string | null;
      reason?: string;
    };
    if (!body.recordType || !body.recordId) {
      return apiJson(400, { error: "recordType and recordId are required." });
    }
    const created = await createLegalHold({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      recordType: body.recordType,
      recordId: body.recordId,
      recordVersionId: body.recordVersionId ?? null,
      reason: body.reason,
      request
    });
    return apiJson(200, created);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Failed to create legal hold.";
    return apiJson(500, { error: details });
  }
}
