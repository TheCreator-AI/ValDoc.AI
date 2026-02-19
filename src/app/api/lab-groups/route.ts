import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

export async function GET() {
  try {
    const session = await getSessionOrThrow();
    const groups = await prisma.labGroup.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { name: "asc" }
    });
    return apiJson(200, groups);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to list lab groups." });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const body = (await request.json()) as { name?: string; description?: string };
    if (!body.name) return apiJson(400, { error: "name is required." });

    const created = await prisma.labGroup.upsert({
      where: { organizationId_name: { organizationId: session.organizationId, name: body.name } },
      update: { description: body.description },
      create: {
        organizationId: session.organizationId,
        name: body.name,
        description: body.description
      }
    });

    return apiJson(200, created);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to save lab group." });
  }
}
