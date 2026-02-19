import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

export async function POST(
  _request: Request,
  context: { params: Promise<{ changeControlId: string }> }
) {
  try {
    const session = await getSessionOrThrow("REVIEWER");
    const { changeControlId } = await context.params;
    const existing = await prisma.changeControl.findFirstOrThrow({
      where: {
        id: changeControlId,
        organizationId: session.organizationId
      }
    });

    const updated = await prisma.changeControl.update({
      where: { id: existing.id },
      data: {
        qaApprovedByUserId: session.userId,
        status: "QA_APPROVED",
        approvedAt: new Date()
      }
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof ApiError) return apiJson(error.status, { error: error.message });
    return apiJson(500, { error: "Failed to approve change control." });
  }
}
