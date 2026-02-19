import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

const parseVersionFromFileName = (fileName: string) => {
  const match = fileName.match(/(?:^|[\s_-])v?(\d+(?:\.\d+){0,2})(?=\D|$)/i);
  return match ? `v${match[1]}` : "N/A";
};

const trimExtension = (fileName: string) => {
  return fileName.replace(/\.[^/.]+$/, "");
};

export async function GET(_request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow();
    const { machineId } = await context.params;

    const machine = await prisma.machine.findFirst({
      where: { id: machineId, organizationId: session.organizationId }
    });
    if (!machine) {
      return apiJson(404, { error: "Machine not found." });
    }

    const uploads = await prisma.sourceDocument.findMany({
      where: {
        organizationId: session.organizationId,
        machineId
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        createdAt: true
      }
    });

    return apiJson(
      200,
      uploads.map((item) => ({
        id: item.id,
        title: trimExtension(item.fileName),
        version: parseVersionFromFileName(item.fileName),
        uploadedAt: item.createdAt.toISOString()
      }))
    );
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to list document uploads." });
  }
}
