import { z } from "zod";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { transitionDocumentVersionState } from "@/server/documents/lifecycle";

const payloadSchema = z.object({
  to_state: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "OBSOLETE"]),
  replacement_version_id: z.string().optional(),
  justification: z.string().optional(),
  emergency_override: z.boolean().optional(),
  override_justification: z.string().optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { id, versionId } = await context.params;
    const body = payloadSchema.parse(await request.json());

    const updated = await transitionDocumentVersionState({
      organizationId: session.organizationId,
      documentId: id,
      versionId,
      actorUserId: session.userId,
      actorRole: session.role,
      toState: body.to_state,
      replacementVersionId: body.replacement_version_id,
      justification: body.justification,
      emergencyOverride: body.emergency_override,
      overrideJustification: body.override_justification,
      request
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(400, { error: error.issues[0]?.message ?? "Invalid payload." });
    }
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to transition document version state." });
  }
}
