import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { releaseLegalHold } from "@/server/retention/service";

export async function POST(request: Request, context: { params: Promise<{ holdId: string }> }) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const { holdId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const released = await releaseLegalHold({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      holdId,
      reason: body.reason,
      request
    });
    return apiJson(200, released);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Failed to release legal hold.";
    return apiJson(500, { error: details });
  }
}
