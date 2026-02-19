import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { writeAuditEvent } from "@/server/audit/events";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

const importFactSchema = z.object({
  fact_type: z.string().min(1).max(80),
  key: z.string().min(1).max(120),
  value: z.string().min(1).max(4000),
  units: z.string().max(60).optional().nullable(),
  source_ref: z.string().max(400).optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable()
});

const importPayloadSchema = z.object({
  facts: z.array(importFactSchema).min(1).max(500)
});

export async function POST(request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { machineId } = await context.params;

    const machine = await prisma.machine.findFirst({
      where: { id: machineId, organizationId: session.organizationId }
    });
    if (!machine) return apiJson(404, { error: "Machine not found." });

    const parseResult = importPayloadSchema.safeParse(await request.json());
    if (!parseResult.success) {
      return apiJson(400, { error: "Invalid import payload.", details: parseResult.error.flatten() });
    }

    const payload = parseResult.data;
    const result = await prisma.equipmentFact.createMany({
      data: payload.facts.map((fact) => ({
        organizationId: session.organizationId,
        machineId,
        factType: fact.fact_type,
        key: fact.key,
        value: fact.value,
        units: fact.units ?? null,
        sourceRef: fact.source_ref ?? null,
        confidence: fact.confidence ?? null,
        createdBy: session.userId
      }))
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "equipment_fact.import",
      entityType: "Machine",
      entityId: machineId,
      details: { factCount: payload.facts.length, insertedCount: result.count }
    });

    return apiJson(201, { imported: result.count });
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to import equipment facts." });
  }
}
