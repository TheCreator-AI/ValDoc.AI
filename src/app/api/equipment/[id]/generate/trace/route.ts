import { prisma } from "@/server/db/prisma";
import { writeAuditEvent } from "@/server/audit/events";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import {
  generateTraceabilityMatrixPayload,
  parseProtocolTestCasesFromDocumentContent,
  parseRaRisksFromDocumentContent,
  parseUrsRequirementsFromDocumentContent
} from "@/server/verification/generator";
import { persistGeneratedPayload } from "@/server/verification/persistence";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { id } = await context.params;

    const machine = await prisma.machine.findFirst({
      where: { id, organizationId: session.organizationId }
    });
    if (!machine) {
      return apiJson(404, { error: "Equipment not found." });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true }
    });

    const ursDoc = await prisma.generatedDocument.findFirst({
      where: {
        organizationId: session.organizationId,
        docType: "URS",
        generationJob: { machineId: machine.id }
      },
      orderBy: { createdAt: "desc" }
    });
    if (!ursDoc) {
      return apiJson(400, { error: "No URS document found for this equipment." });
    }

    const raDoc = await prisma.generatedDocument.findFirst({
      where: {
        organizationId: session.organizationId,
        docType: "RID",
        generationJob: { machineId: machine.id }
      },
      orderBy: { createdAt: "desc" }
    });
    if (!raDoc) {
      return apiJson(400, { error: "No RA document found for this equipment." });
    }

    const ioqDoc = await prisma.generatedDocument.findFirst({
      where: {
        organizationId: session.organizationId,
        docType: "IOQ",
        generationJob: { machineId: machine.id }
      },
      orderBy: { createdAt: "desc" }
    });
    if (!ioqDoc) {
      return apiJson(400, { error: "No IOQ document found for this equipment." });
    }

    const oqDoc = await prisma.generatedDocument.findFirst({
      where: {
        organizationId: session.organizationId,
        docType: "OQ",
        generationJob: { machineId: machine.id }
      },
      orderBy: { createdAt: "desc" }
    });
    if (!oqDoc) {
      return apiJson(400, { error: "No OQ document found for this equipment." });
    }

    const payload = generateTraceabilityMatrixPayload({
      systemName: machine.name,
      equipmentId: machine.modelNumber,
      generatedBy: user?.email ?? session.userId,
      ursRequirements: parseUrsRequirementsFromDocumentContent(ursDoc.currentContent),
      raRisks: parseRaRisksFromDocumentContent(raDoc.currentContent),
      ioqTestCases: parseProtocolTestCasesFromDocumentContent(ioqDoc.currentContent),
      oqTestCases: parseProtocolTestCasesFromDocumentContent(oqDoc.currentContent),
      outputRefPrefix: machine.id
    });

    const persisted = await persistGeneratedPayload({
      organizationId: session.organizationId,
      userId: session.userId,
      machineId: machine.id,
      docType: "TRACEABILITY",
      title: `Traceability Matrix for ${machine.name}`,
      stage: "PRE_EXECUTION",
      payload,
      citations: {
        schema: "tm.v1",
        machineId: machine.id,
        sourceUrsDocumentId: ursDoc.id,
        sourceRaDocumentId: raDoc.id,
        sourceIoqDocumentId: ioqDoc.id,
        sourceOqDocumentId: oqDoc.id
      },
      changeComment: `Traceability matrix generated for equipment ${machine.id}`
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "traceability.generate",
      entityType: "GeneratedDocument",
      entityId: persisted.document.id,
      details: {
        machineId: machine.id,
        version: persisted.version,
        hash: persisted.hash
      }
    });

    return apiJson(201, {
      traceabilityDocumentId: persisted.document.id,
      version: persisted.version,
      hash: persisted.hash,
      payload
    });
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    const details = error instanceof Error ? error.message : "Unknown error";
    return apiJson(500, { error: `Failed to generate traceability matrix. ${details}` });
  }
}
