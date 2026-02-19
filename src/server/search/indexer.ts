import { prisma } from "@/server/db/prisma";

export const indexSourceChunks = async (
  organizationId: string,
  sourceDocumentId: string,
  chunks: Array<{ page: number; section: string; text: string }>
) => {
  await prisma.sourceChunk.deleteMany({
    where: { sourceDocumentId }
  });

  if (chunks.length === 0) {
    return;
  }

  await prisma.sourceChunk.createMany({
    data: chunks.map((chunk) => ({
      organizationId,
      sourceDocumentId,
      pageNumber: chunk.page,
      sectionLabel: chunk.section,
      chunkText: chunk.text
    }))
  });
};

export const searchChunks = async (organizationId: string, query: string) => {
  return await prisma.sourceChunk.findMany({
    where: {
      organizationId,
      chunkText: { contains: query }
    },
    take: 30,
    orderBy: { createdAt: "desc" }
  });
};
