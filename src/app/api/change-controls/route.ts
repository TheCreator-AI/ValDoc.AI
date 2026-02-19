import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

type CreateChangeControlPayload = {
  machineId?: string;
  title?: string;
  description?: string;
  changeType?: string;
  riskAssessment?: string;
  systemImpactSummary?: string;
  requiresRevalidation?: boolean;
  revalidationPlan?: string;
  trainingPlan?: string;
  labImpacts?: Array<{ labGroupId: string; impactLevel?: string; impactSummary?: string }>;
};

export async function GET() {
  try {
    const session = await getSessionOrThrow();
    const rows = await prisma.changeControl.findMany({
      where: { organizationId: session.organizationId },
      include: { impacts: { include: { labGroup: true } }, machine: true },
      orderBy: { createdAt: "desc" }
    });
    return apiJson(200, rows);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to list change controls." });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const body = (await request.json()) as CreateChangeControlPayload;

    if (!body.title || !body.description || !body.changeType) {
      return apiJson(400, { error: "title, description, and changeType are required." });
    }

    const created = await prisma.changeControl.create({
      data: {
        organizationId: session.organizationId,
        machineId: body.machineId,
        requestedByUserId: session.userId,
        title: body.title,
        description: body.description,
        changeType: body.changeType,
        status: "DRAFT",
        riskAssessment: body.riskAssessment,
        systemImpactSummary: body.systemImpactSummary,
        requiresRevalidation: body.requiresRevalidation ?? false,
        revalidationPlan: body.revalidationPlan,
        trainingPlan: body.trainingPlan,
        impacts: body.labImpacts && body.labImpacts.length > 0 ? {
          create: body.labImpacts.map((impact) => ({
            labGroupId: impact.labGroupId,
            impactLevel: impact.impactLevel ?? "MEDIUM",
            impactSummary: impact.impactSummary
          }))
        } : undefined
      },
      include: { impacts: { include: { labGroup: true } }, machine: true }
    });

    return apiJson(201, created);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to create change control." });
  }
}
