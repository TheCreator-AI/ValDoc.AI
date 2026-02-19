import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { runGenerationPipeline } from "@/server/pipeline/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { id } = await context.params;
    const body = (await request.json()) as {
      intendedUse?: string;
      selectedDocTypes?: string[];
    };

    const result = await runGenerationPipeline({
      organizationId: session.organizationId,
      userId: session.userId,
      machineId: id,
      intendedUse: body.intendedUse ?? "",
      selectedDocTypes: Array.isArray(body.selectedDocTypes) ? body.selectedDocTypes : undefined,
      request
    });

    return apiJson(201, result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Unknown error";
    return apiJson(500, { error: `Failed to run generation pipeline. ${details}` });
  }
}
