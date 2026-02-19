import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { generateAccessReviewReport, listAccessReviewReports } from "@/server/access-review/service";

export async function GET() {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const reports = await listAccessReviewReports(session.organizationId);
    return apiJson(200, reports);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to list access review reports." });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const report = await generateAccessReviewReport({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      actorEmail: session.email,
      request
    });
    return apiJson(201, report);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Failed to generate access review report.";
    return apiJson(500, { error: details });
  }
}

