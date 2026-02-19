import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

export async function GET(_request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow();
    const { machineId } = await context.params;

    const docs = await prisma.generatedDocument.findMany({
      where: {
        organizationId: session.organizationId,
        generationJob: {
          machineId
        },
        stage: {
          in: ["PRE_EXECUTION", "EXECUTION"]
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return apiJson(200, docs);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to list machine documents." });
  }
}
