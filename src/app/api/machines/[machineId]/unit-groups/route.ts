import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

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

    const groups = await prisma.unitGroup.findMany({
      where: {
        machineId,
        organizationId: session.organizationId
      },
      orderBy: { name: "asc" }
    });

    return apiJson(200, groups);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to list unit groups." });
  }
}

export async function POST(request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { machineId } = await context.params;
    const body = (await request.json()) as { name?: string; description?: string };
    const name = body.name?.trim();

    if (!name) {
      return apiJson(400, { error: "name is required." });
    }

    const machine = await prisma.machine.findFirst({
      where: { id: machineId, organizationId: session.organizationId }
    });
    if (!machine) {
      return apiJson(404, { error: "Machine not found." });
    }

    const created = await prisma.unitGroup.upsert({
      where: {
        machineId_name: {
          machineId,
          name
        }
      },
      update: {
        description: body.description ?? null
      },
      create: {
        organizationId: session.organizationId,
        machineId,
        name,
        description: body.description ?? null
      }
    });

    return apiJson(200, created);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to save unit group." });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ machineId: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { machineId } = await context.params;
    const body = (await request.json()) as { unitId?: string; unitGroupId?: string | null };

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

    if (body.unitGroupId) {
      const group = await prisma.unitGroup.findFirst({
        where: {
          id: body.unitGroupId,
          machineId,
          organizationId: session.organizationId
        }
      });
      if (!group) {
        return apiJson(404, { error: "Unit group not found." });
      }
    }

    const updated = await prisma.unit.update({
      where: { id: unit.id },
      data: {
        unitGroupId: body.unitGroupId ?? null
      }
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to assign unit group." });
  }
}
