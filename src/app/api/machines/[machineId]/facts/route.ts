import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { writeAuditEvent } from "@/server/audit/events";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

const factPayloadSchema = z.object({
  fact_type: z.string().min(1).max(80),
  key: z.string().min(1).max(120),
  value: z.string().min(1).max(4000),
  units: z.string().max(60).optional().nullable(),
  source_ref: z.string().max(400).optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable()
});

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

    const facts = await prisma.equipmentFact.findMany({
      where: {
        machineId,
        organizationId: session.organizationId
      },
      orderBy: [{ factType: "asc" }, { key: "asc" }, { createdAt: "desc" }]
    });

    return apiJson(200, facts);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to list equipment facts." });
  }
}

export async function POST(request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { machineId } = await context.params;

    const machine = await prisma.machine.findFirst({
      where: { id: machineId, organizationId: session.organizationId }
    });
    if (!machine) {
      return apiJson(404, { error: "Machine not found." });
    }

    const parseResult = factPayloadSchema.safeParse(await request.json());
    if (!parseResult.success) {
      return apiJson(400, { error: "Invalid fact payload.", details: parseResult.error.flatten() });
    }

    const payload = parseResult.data;
    const created = await prisma.equipmentFact.create({
      data: {
        organizationId: session.organizationId,
        machineId,
        factType: payload.fact_type,
        key: payload.key,
        value: payload.value,
        units: payload.units ?? null,
        sourceRef: payload.source_ref ?? null,
        confidence: payload.confidence ?? null,
        createdBy: session.userId
      }
    });

    try {
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: "equipment_fact.create",
        entityType: "EquipmentFact",
        entityId: created.id,
        details: {
          machineId,
          factType: payload.fact_type,
          key: payload.key
        }
      });
    } catch (auditError) {
      console.error("Audit write failed for equipment_fact.create", auditError);
    }

    return apiJson(201, created);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    const details = error instanceof Error ? error.message : "Unknown error";
    return apiJson(500, { error: `Failed to create equipment fact. ${details}` });
  }
}
