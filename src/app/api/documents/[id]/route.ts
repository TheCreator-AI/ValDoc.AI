import { z } from "zod";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { softDeleteRegulatedDocument } from "@/server/documents/lifecycle";

const deleteSchema = z.object({
  reason: z.string().min(1, "Delete reason is required.")
});

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { id } = await context.params;
    const body = deleteSchema.parse(await request.json());

    const deleted = await softDeleteRegulatedDocument({
      organizationId: session.organizationId,
      documentId: id,
      actorUserId: session.userId,
      reason: body.reason,
      request
    });

    return apiJson(200, deleted);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(400, { error: error.issues[0]?.message ?? "Invalid payload." });
    }
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to soft-delete document." });
  }
}
