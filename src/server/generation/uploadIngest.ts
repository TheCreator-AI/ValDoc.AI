import { SourceType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { parseSourceDocument } from "@/server/parsers/pdfParser";
import { indexSourceChunks } from "@/server/search/indexer";
import { extractFactModel } from "@/server/extract/factModel";
import { saveUploadedFile } from "@/server/files/storage";

const toSourceType = (value: string): SourceType => {
  if (Object.values(SourceType).includes(value as SourceType)) {
    return value as SourceType;
  }
  return SourceType.MANUAL;
};

export const ingestUpload = async (params: {
  organizationId: string;
  machineId: string;
  userId: string;
  file: File;
  sourceType: string;
}) => {
  await prisma.machine.findFirstOrThrow({
    where: {
      id: params.machineId,
      organizationId: params.organizationId
    }
  });

  const sourceType = toSourceType(params.sourceType);
  const stored = await saveUploadedFile(params.file, { kind: "SOURCE_DOCUMENT" });
  const bytes = Buffer.from(await params.file.arrayBuffer());

  const source = await prisma.sourceDocument.create({
    data: {
      organizationId: params.organizationId,
      machineId: params.machineId,
      uploadedByUserId: params.userId,
      fileName: stored.fileName,
      filePath: stored.filePath,
      mimeType: stored.mimeType,
      sourceType
    }
  });

  const parsed = await parseSourceDocument(bytes, source.mimeType);
  await prisma.sourceDocument.update({
    where: { id: source.id },
    data: {
      extractedText: parsed.fullText,
      citationsJson: JSON.stringify(parsed.chunks)
    }
  });

  await indexSourceChunks(params.organizationId, source.id, parsed.chunks);

  const factModel = extractFactModel(source.id, parsed.chunks);
  await prisma.machine.update({
    where: { id: params.machineId },
    data: {
      equipmentFactModel: JSON.stringify(factModel)
    }
  });

  return {
    sourceId: source.id,
    chunksIndexed: parsed.chunks.length,
    factModel
  };
};
