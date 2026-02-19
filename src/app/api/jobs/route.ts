import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

export async function GET() {
  try {
    const session = await getSessionOrThrow();

    const jobs = await prisma.generationJob.findMany({
      where: { organizationId: session.organizationId },
      include: {
        machine: true,
        documents: {
          where: { deletedAt: null },
          include: {
            versions: {
              orderBy: { versionNumber: "desc" },
              take: 1
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    return apiJson(
      200,
      jobs.map((job) => ({
        ...job,
        documents: job.documents.map((document) => ({
          ...document,
          latestVersionId: document.versions[0]?.id ?? null,
          latestVersionNumber: document.versions[0]?.versionNumber ?? null,
          latestVersionState: document.versions[0]?.state ?? null,
          versions: undefined
        }))
      }))
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to list jobs." });
  }
}
