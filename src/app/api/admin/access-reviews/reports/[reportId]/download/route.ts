import fs from "node:fs/promises";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { getAccessReviewReportForDownload } from "@/server/access-review/service";
import { ensureStoragePathIsSafe } from "@/server/files/storage";

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const { reportId } = await context.params;
    const report = await getAccessReviewReportForDownload({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      reportId,
      request
    });

    ensureStoragePathIsSafe(report.reportPath);
    const bytes = await fs.readFile(report.reportPath);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="access-review-${report.id}.csv"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Failed to download access review report.";
    return apiJson(500, { error: details });
  }
}

