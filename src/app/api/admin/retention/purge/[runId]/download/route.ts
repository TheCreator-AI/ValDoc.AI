import fs from "node:fs/promises";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { ensureStoragePathIsSafe } from "@/server/files/storage";
import { getRetentionPurgeRunForDownload } from "@/server/retention/service";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const { runId } = await context.params;
    const run = await getRetentionPurgeRunForDownload({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      runId,
      request
    });
    ensureStoragePathIsSafe(run.reportPath);
    const bytes = await fs.readFile(run.reportPath);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="retention-purge-${run.id}.json"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Failed to download purge report.";
    return apiJson(500, { error: details });
  }
}
