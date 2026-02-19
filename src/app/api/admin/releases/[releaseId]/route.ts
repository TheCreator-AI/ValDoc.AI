import { z } from "zod";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { updateReleaseEntry } from "@/server/releases/service";

const patchSchema = z.object({
  change_summary: z.string().min(1).optional(),
  risk_impact: z.string().min(1).optional(),
  deployed_at: z.string().datetime().nullable().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ releaseId: string }> }) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const body = patchSchema.parse(await request.json());
    const { releaseId } = await context.params;
    const updated = await updateReleaseEntry({
      organizationId: session.organizationId,
      releaseId,
      actorUserId: session.userId,
      patch: {
        changeSummary: body.change_summary?.trim(),
        riskImpact: body.risk_impact?.trim(),
        deployedAt: body.deployed_at === undefined ? undefined : body.deployed_at ? new Date(body.deployed_at) : null
      },
      request
    });
    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(400, { error: error.issues[0]?.message ?? "Invalid payload." });
    }
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to update release entry." });
  }
}
