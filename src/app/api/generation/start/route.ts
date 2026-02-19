import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { generateValidationPackage } from "@/server/generation/generateDocuments";
import type { FactModel } from "@/server/extract/factModel";
import { writeAuditEvent } from "@/server/audit/events";

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const body = (await request.json()) as {
      machineId?: string;
      phase?: "pre_execution" | "post_execution";
      intendedUseText?: string;
      requirementCategories?: string[];
    };
    if (!body.machineId) {
      return apiJson(400, { error: "machineId is required." });
    }

    const machine = await prisma.machine.findFirst({
      where: {
        id: body.machineId,
        organizationId: session.organizationId
      }
    });

    if (!machine) {
      return apiJson(404, { error: "Machine not found." });
    }

    const factModel: FactModel = machine.equipmentFactModel
      ? (JSON.parse(machine.equipmentFactModel) as FactModel)
      : {
          intendedUse: null,
          coreFunctions: [],
          utilities: [],
          safetyFeatures: [],
          sensors: [],
          dataInterfaces: [],
          softwareVersion: null,
          processRanges: [],
          citations: []
        };

    const job = await generateValidationPackage({
      organizationId: session.organizationId,
      machineId: body.machineId,
      userId: session.userId,
      factModel,
      phase: body.phase ?? "pre_execution",
      intendedUseText: body.intendedUseText,
      requirementCategories: Array.isArray(body.requirementCategories) ? body.requirementCategories : []
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "document.generate",
      entityType: "GenerationJob",
      entityId: job.id,
      details: {
        machineId: body.machineId,
        phase: body.phase ?? "pre_execution",
        documentCount: job.documents?.length ?? 0
      },
      request
    });

    return apiJson(200, job);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Generation failed." });
  }
}
