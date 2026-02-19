import { prisma } from "@/server/db/prisma";
import { writeAuditEvent } from "@/server/audit/events";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { generateRaPayloadFromUrs, hashRaPayload, parseUrsRequirementsFromContent } from "@/server/risk/generator";
import { diffJsonContent } from "@/server/audit/diff";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { id } = await context.params;

    const ursDocument = await prisma.generatedDocument.findFirst({
      where: {
        id,
        organizationId: session.organizationId,
        docType: "URS"
      },
      include: {
        generationJob: {
          include: {
            machine: true
          }
        }
      }
    });

    if (!ursDocument) {
      return apiJson(404, { error: "URS document not found." });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true }
    });

    const requirements = parseUrsRequirementsFromContent(ursDocument.currentContent);
    if (requirements.length === 0) {
      return apiJson(400, { error: "No URS requirements found for RA generation." });
    }

    const generatedAt = new Date().toISOString();
    const payload = generateRaPayloadFromUrs({
      systemName: ursDocument.generationJob.machine.name,
      equipmentId: ursDocument.generationJob.machine.modelNumber,
      generatedBy: user?.email ?? session.userId,
      requirements,
      generatedAt
    });
    const hash = hashRaPayload(payload);

    let raDocument = await prisma.generatedDocument.findFirst({
      where: {
        organizationId: session.organizationId,
        generationJobId: ursDocument.generationJobId,
        docType: "RID",
        title: `RA for URS ${ursDocument.id}`
      }
    });
    const previousContent = raDocument?.currentContent ?? "";

    if (!raDocument) {
      raDocument = await prisma.generatedDocument.create({
        data: {
          organizationId: session.organizationId,
          generationJobId: ursDocument.generationJobId,
          docType: "RID",
          stage: "PRE_EXECUTION",
          title: `RA for URS ${ursDocument.id}`,
          currentContent: JSON.stringify(payload, null, 2),
          citationsJson: JSON.stringify({
            sourceUrsDocumentId: ursDocument.id,
            schema: "ra.v1"
          })
        }
      });
    } else {
      raDocument = await prisma.generatedDocument.update({
        where: { id: raDocument.id },
        data: {
          currentContent: JSON.stringify(payload, null, 2)
        }
      });
    }

    const lastVersion = await prisma.documentVersion.findFirst({
      where: { generatedDocumentId: raDocument.id },
      orderBy: { versionNumber: "desc" }
    });

    const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;
    await prisma.documentVersion.create({
      data: {
        generatedDocumentId: raDocument.id,
        editedByUserId: session.userId,
        versionNumber: nextVersion,
        contentSnapshot: JSON.stringify(payload, null, 2),
        contentHash: hash,
        changeComment: `RA generated from URS ${ursDocument.id}`
      }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "ra.generate",
      entityType: "GeneratedDocument",
      entityId: raDocument.id,
      details: {
        sourceUrsId: ursDocument.id,
        version: nextVersion,
        hash
      },
      fieldChanges: diffJsonContent(previousContent, JSON.stringify(payload, null, 2)).filter((change) =>
        /(^|\.)(severity|occurrence|detection|initial_risk|residual_risk)$/.test(change.changePath)
      )
    });

    return apiJson(201, {
      raDocumentId: raDocument.id,
      version: nextVersion,
      hash,
      payload
    });
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    const details = error instanceof Error ? error.message : "Unknown error";
    return apiJson(500, { error: `Failed to generate RA. ${details}` });
  }
}
