import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const session = await getSessionOrThrow();
    const { jobId } = await context.params;

    const job = await prisma.generationJob.findFirst({
      where: {
        id: jobId,
        organizationId: session.organizationId
      },
      include: {
        machine: true,
        documents: {
          include: {
            versions: true,
            traceLinks: true
          }
        }
      }
    });

    if (!job) {
      return apiJson(404, { error: "Job not found." });
    }

    return apiJson(200, job);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to fetch job." });
  }
}
