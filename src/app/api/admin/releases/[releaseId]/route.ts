import { z } from "zod";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { updateReleaseEntry } from "@/server/releases/service";

const patchSchema = z.object({
  change_summary: z.string().min(1).optional(),
  risk_impact: z.string().min(1).optional(),
  build_hash: z.string().min(1).optional(),
  sbom_hash: z.string().min(1).optional(),
  test_results_summary_hash: z.string().min(1).optional(),
  production_deploy_requested: z.boolean().optional(),
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
        buildHash: body.build_hash?.trim(),
        sbomHash: body.sbom_hash?.trim(),
        testResultsSummaryHash: body.test_results_summary_hash?.trim(),
        productionDeployRequested: body.production_deploy_requested,
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
