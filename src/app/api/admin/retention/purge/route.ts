import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { runRetentionPurge } from "@/server/retention/service";

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
    const result = await runRetentionPurge({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      dryRun: body.dryRun ?? true,
      request
    });
    return apiJson(200, result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Failed to run retention purge.";
    return apiJson(500, { error: details });
  }
}
