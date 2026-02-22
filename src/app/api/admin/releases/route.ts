import { z } from "zod";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { createReleaseEntry, listReleaseEntries } from "@/server/releases/service";

const createSchema = z.object({
  build_version: z.string().min(1),
  release_date: z.string().datetime(),
  change_summary: z.string().min(1),
  risk_impact: z.string().min(1),
  build_hash: z.string().min(1),
  sbom_hash: z.string().min(1),
  test_results_summary_hash: z.string().min(1),
  production_deploy_requested: z.boolean().optional(),
  deployed_at: z.string().datetime().optional()
});

export async function GET() {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const rows = await listReleaseEntries(session.organizationId);
    return apiJson(200, rows);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to list release entries." });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const body = createSchema.parse(await request.json());
    const created = await createReleaseEntry({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      payload: {
        buildVersion: body.build_version.trim(),
        releaseDate: new Date(body.release_date),
        changeSummary: body.change_summary.trim(),
        riskImpact: body.risk_impact.trim(),
        buildHash: body.build_hash.trim(),
        sbomHash: body.sbom_hash.trim(),
        testResultsSummaryHash: body.test_results_summary_hash.trim(),
        productionDeployRequested: body.production_deploy_requested ?? false,
        deployedAt: body.deployed_at ? new Date(body.deployed_at) : null
      },
      request
    });
    return apiJson(201, created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(400, { error: error.issues[0]?.message ?? "Invalid payload." });
    }
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to create release entry." });
  }
}
