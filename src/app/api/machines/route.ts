import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

export async function GET() {
  try {
    const session = await getSessionOrThrow();
    const machines = await prisma.machine.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" }
    });

    return apiJson(200, machines);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to list machines." });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const body = (await request.json()) as {
      name?: string;
      modelNumber?: string;
      manufacturer?: string;
    };

    if (!body.name || !body.modelNumber || !body.manufacturer) {
      return apiJson(400, { error: "name, modelNumber, and manufacturer are required." });
    }

    const created = await prisma.machine.create({
      data: {
        organizationId: session.organizationId,
        name: body.name,
        modelNumber: body.modelNumber,
        manufacturer: body.manufacturer
      }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "equipment.create",
      entityType: "Machine",
      entityId: created.id,
      details: { name: created.name, modelNumber: created.modelNumber, manufacturer: created.manufacturer },
      request
    });

    return apiJson(201, created);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to create machine." });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const body = (await request.json()) as { machineId?: string };

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

    await prisma.machine.delete({
      where: { id: machine.id }
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "equipment.delete",
      entityType: "Machine",
      entityId: machine.id,
      details: { name: machine.name, modelNumber: machine.modelNumber },
      request
    });

    return apiJson(200, { deleted: true, machineId: machine.id });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to delete machine." });
  }
}
