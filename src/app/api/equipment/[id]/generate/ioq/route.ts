import { prisma } from "@/server/db/prisma";
import { writeAuditEvent } from "@/server/audit/events";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import {
  generateIoqPayload,
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

    const facts = await prisma.equipmentFact.findMany({
      where: {
        organizationId: session.organizationId,
        machineId: machine.id
      },
      orderBy: [{ factType: "asc" }, { key: "asc" }, { createdAt: "asc" }]
    });

    const ursDoc = await prisma.generatedDocument.findFirst({
      where: {
        organizationId: session.organizationId,
        docType: "URS",
        generationJob: {
          machineId: machine.id
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const payload = generateIoqPayload({
      systemName: machine.name,
      equipmentId: machine.modelNumber,
      generatedBy: user?.email ?? session.userId,
      facts: facts.map((fact) => ({ key: fact.key, value: fact.value, units: fact.units })),
      ursRequirements: ursDoc ? parseUrsRequirementsFromDocumentContent(ursDoc.currentContent) : []
    });

    const persisted = await persistGeneratedPayload({
      organizationId: session.organizationId,
      userId: session.userId,
      machineId: machine.id,
      docType: "IOQ",
      title: `IOQ for ${machine.name}`,
      stage: "PRE_EXECUTION",
      payload,
      citations: {
        schema: "ioq.v1",
        machineId: machine.id,
        sourceUrsDocumentId: ursDoc?.id ?? null
      },
      changeComment: `IOQ generated for equipment ${machine.id}`
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "ioq.generate",
      entityType: "GeneratedDocument",
      entityId: persisted.document.id,
      details: {
        machineId: machine.id,
        version: persisted.version,
        hash: persisted.hash
      }
    });

    return apiJson(201, {
      ioqDocumentId: persisted.document.id,
      version: persisted.version,
      hash: persisted.hash,
      payload
    });
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    const details = error instanceof Error ? error.message : "Unknown error";
    return apiJson(500, { error: `Failed to generate IOQ. ${details}` });
  }
}
