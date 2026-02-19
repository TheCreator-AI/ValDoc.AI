import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

export async function GET(_request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow();
    const { machineId } = await context.params;

    const units = await prisma.unit.findMany({
      where: {
        machineId,
        organizationId: session.organizationId
      },
      orderBy: { unitCode: "asc" }
    });

    return apiJson(200, units);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to list units." });
  }
}

export async function POST(request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { machineId } = await context.params;
    const body = (await request.json()) as {
      unitCode?: string;
      baseCode?: string;
      count?: number;
    };

    const machine = await prisma.machine.findFirst({
      where: { id: machineId, organizationId: session.organizationId }
    });

    if (!machine) {
      return apiJson(404, { error: "Machine not found." });
    }

    if (body.unitCode) {
      const created = await prisma.unit.create({
        data: {
          organizationId: session.organizationId,
          machineId,
          unitCode: body.unitCode
        }
      });
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: "unit.create",
        entityType: "Unit",
        entityId: created.id,
        details: { machineId, unitCode: created.unitCode },
        request
      });
      return apiJson(201, { created: [created] });
    }

    const baseCode = body.baseCode?.trim();
    const count = body.count ?? 0;

    if (!baseCode || count < 1) {
      return apiJson(400, { error: "Provide unitCode or baseCode + count." });
    }

    const created = [];
    for (let i = 1; i <= count; i += 1) {
      const code = `${baseCode}-${i}`;
      const unit = await prisma.unit.upsert({
        where: { machineId_unitCode: { machineId, unitCode: code } },
        update: {},
        create: {
          organizationId: session.organizationId,
          machineId,
          unitCode: code
        }
      });
      created.push(unit);
    }

    await Promise.all(
      created.map((unit) =>
        writeAuditEvent({
          organizationId: session.organizationId,
          actorUserId: session.userId,
          action: "unit.create_or_upsert",
          entityType: "Unit",
          entityId: unit.id,
          details: { machineId, unitCode: unit.unitCode },
          request
        })
      )
    );

    return apiJson(201, { created });
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to create units." });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const { machineId } = await context.params;
    const body = (await request.json()) as { unitId?: string };

    if (!body.unitId) {
      return apiJson(400, { error: "unitId is required." });
    }

    const unit = await prisma.unit.findFirst({
      where: {
        id: body.unitId,
        machineId,
        organizationId: session.organizationId
      }
    });

    if (!unit) {
      return apiJson(404, { error: "Unit not found." });
    }

    await prisma.unit.delete({ where: { id: unit.id } });
    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "unit.delete",
      entityType: "Unit",
      entityId: unit.id,
      details: { machineId, unitCode: unit.unitCode },
      request
    });
    return apiJson(200, { deleted: true, unitId: unit.id });
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to delete unit." });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const { machineId } = await context.params;
    const body = (await request.json()) as {
      unitId?: string;
      serialNumber?: string | null;
      location?: string | null;
      procurementDate?: string | null;
      calibrationDate?: string | null;
      calibrationDueDate?: string | null;
      pmPlanNumber?: string | null;
    };

    if (!body.unitId) {
      return apiJson(400, { error: "unitId is required." });
    }

    const unit = await prisma.unit.findFirst({
      where: {
        id: body.unitId,
        machineId,
        organizationId: session.organizationId
      }
    });

    if (!unit) {
      return apiJson(404, { error: "Unit not found." });
    }

    const parseDate = (value?: string | null) => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date;
    };

    const updated = await prisma.unit.update({
      where: { id: unit.id },
      data: {
        serialNumber: body.serialNumber ?? null,
        location: body.location ?? null,
        procurementDate: parseDate(body.procurementDate),
        calibrationDate: parseDate(body.calibrationDate),
        calibrationDueDate: parseDate(body.calibrationDueDate),
        pmPlanNumber: body.pmPlanNumber ?? null
      }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "unit.update",
      entityType: "Unit",
      entityId: updated.id,
      details: {
        machineId,
        serialNumber: updated.serialNumber,
        location: updated.location,
        pmPlanNumber: updated.pmPlanNumber
      },
      request
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to update unit details." });
  }
}
