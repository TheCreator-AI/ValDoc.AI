import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { getRetentionConfiguration, updateRetentionConfiguration } from "@/server/retention/service";

export async function GET() {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const config = await getRetentionConfiguration(session.organizationId);
    return apiJson(200, config);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to load retention configuration." });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const body = (await request.json().catch(() => ({}))) as {
      auditEventRetentionDays?: number | null;
      documentVersionRetentionDays?: number | null;
      legalHoldEnabled?: boolean;
    };
    const config = await updateRetentionConfiguration({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      auditEventRetentionDays: body.auditEventRetentionDays,
      documentVersionRetentionDays: body.documentVersionRetentionDays,
      legalHoldEnabled: body.legalHoldEnabled,
      request
    });
    return apiJson(200, config);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Failed to update retention configuration.";
    return apiJson(400, { error: details });
  }
}
