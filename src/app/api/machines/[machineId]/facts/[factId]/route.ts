import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { writeAuditEvent } from "@/server/audit/events";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

const updateFactSchema = z
  .object({
    fact_type: z.string().min(1).max(80).optional(),
    key: z.string().min(1).max(120).optional(),
    value: z.string().min(1).max(4000).optional(),
    units: z.string().max(60).optional().nullable(),
    source_ref: z.string().max(400).optional().nullable(),
    confidence: z.number().min(0).max(1).optional().nullable()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required."
  });

const getFactOr404 = async (params: { factId: string; machineId: string; organizationId: string }) => {
  const fact = await prisma.equipmentFact.findFirst({
    where: {
      id: params.factId,
      machineId: params.machineId,
      organizationId: params.organizationId
    }
  });
  return fact;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ machineId: string; factId: string }> }
) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { machineId, factId } = await context.params;

    const fact = await getFactOr404({ factId, machineId, organizationId: session.organizationId });
    if (!fact) return apiJson(404, { error: "Equipment fact not found." });

    const parseResult = updateFactSchema.safeParse(await request.json());
    if (!parseResult.success) {
      return apiJson(400, { error: "Invalid update payload.", details: parseResult.error.flatten() });
    }

    const payload = parseResult.data;
    const updated = await prisma.equipmentFact.update({
      where: { id: fact.id },
      data: {
        factType: payload.fact_type ?? fact.factType,
        key: payload.key ?? fact.key,
        value: payload.value ?? fact.value,
        units: payload.units ?? fact.units,
        sourceRef: payload.source_ref ?? fact.sourceRef,
        confidence: payload.confidence ?? fact.confidence
      }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "equipment_fact.update",
      entityType: "EquipmentFact",
      entityId: updated.id,
      details: { machineId, changedFields: Object.keys(payload) }
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to update equipment fact." });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ machineId: string; factId: string }> }
) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const { machineId, factId } = await context.params;

    const fact = await getFactOr404({ factId, machineId, organizationId: session.organizationId });
    if (!fact) return apiJson(404, { error: "Equipment fact not found." });

    await prisma.equipmentFact.delete({ where: { id: fact.id } });
    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "equipment_fact.delete",
      entityType: "EquipmentFact",
      entityId: fact.id,
      details: { machineId, key: fact.key }
    });

    return apiJson(200, { deleted: true, factId: fact.id });
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to delete equipment fact." });
  }
}
