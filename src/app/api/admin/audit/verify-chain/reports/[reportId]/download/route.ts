import fs from "node:fs/promises";
import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";
import { ensureStoragePathIsSafe } from "@/server/files/storage";
import { getTamperEvidenceReportForDownload } from "@/server/audit/verificationReport";

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "audit.read");
    const { reportId } = await context.params;
    const report = await getTamperEvidenceReportForDownload({
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
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=\"audit-verify-${report.id}.json\"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Failed to download tamper-evidence report.";
    return apiJson(500, { error: details });
  }
}
