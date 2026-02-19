import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { setReviewDecision } from "@/server/workflow/review";
import { QualityGateFailureError } from "@/server/quality/documentQualityGate";

export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await getSessionOrThrow("REVIEWER");
    const { documentId } = await context.params;
    const body = (await request.json()) as { decision?: "APPROVED" | "REJECTED" };

    if (!body.decision) {
      return apiJson(400, { error: "decision is required." });
    }

    const updated = await setReviewDecision({
      organizationId: session.organizationId,
      documentId,
      decision: body.decision,
      actorUserId: session.userId,
      request
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof QualityGateFailureError) {
      return apiJson(422, { error: error.message, issues: error.issues });
    }
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to update review decision." });
  }
}
