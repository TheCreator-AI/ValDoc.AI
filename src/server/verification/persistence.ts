import type { DocType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { hashPayload } from "@/server/verification/generator";

export const persistGeneratedPayload = async (params: {
  organizationId: string;
  userId: string;
  machineId: string;
  docType: DocType;
  title: string;
  stage?: "PRE_EXECUTION" | "EXECUTION" | "POST_EXECUTION";
  payload: unknown;
  citations: Record<string, unknown>;
  changeComment: string;
}) => {
  const job =
    (await prisma.generationJob.findFirst({
      where: {
        organizationId: params.organizationId,
        machineId: params.machineId
      },
      orderBy: { createdAt: "desc" }
    })) ??
    (await prisma.generationJob.create({
      data: {
        organizationId: params.organizationId,
        machineId: params.machineId,
        createdByUserId: params.userId,
        status: "COMPLETE"
      }
    }));

  const content = JSON.stringify(params.payload, null, 2);
  const citationsJson = JSON.stringify(params.citations);
  const existing = await prisma.generatedDocument.findFirst({
    where: {
      organizationId: params.organizationId,
      docType: params.docType,
      title: params.title,
      generationJob: {
        machineId: params.machineId
      }
    }
  });

  const document = existing
    ? await prisma.generatedDocument.update({
        where: { id: existing.id },
        data: {
          currentContent: content,
          citationsJson,
          stage: params.stage ?? "PRE_EXECUTION"
        }
      })
    : await prisma.generatedDocument.create({
        data: {
          organizationId: params.organizationId,
          generationJobId: job.id,
          docType: params.docType,
          stage: params.stage ?? "PRE_EXECUTION",
          title: params.title,
          currentContent: content,
          citationsJson
        }
      });

  const lastVersion = await prisma.documentVersion.findFirst({
    where: { generatedDocumentId: document.id },
    orderBy: { versionNumber: "desc" }
  });
  const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;
  const hash = hashPayload(params.payload);

  await prisma.documentVersion.create({
    data: {
      generatedDocumentId: document.id,
      editedByUserId: params.userId,
      versionNumber: nextVersion,
      contentSnapshot: content,
      contentHash: hash,
      changeComment: params.changeComment
    }
  });

  return { document, version: nextVersion, hash };
};
