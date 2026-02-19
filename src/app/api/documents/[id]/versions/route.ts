import { z } from "zod";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { createDocumentVersion, listDocumentVersionHistory } from "@/server/documents/lifecycle";

const payloadSchema = z.object({
  content_json: z.string().optional(),
  change_reason: z.string().min(1, "change_reason is required."),
  correction: z.boolean().optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { id } = await context.params;
    const body = payloadSchema.parse(await request.json());

    const created = await createDocumentVersion({
      organizationId: session.organizationId,
      documentId: id,
      actorUserId: session.userId,
      changeReason: body.change_reason,
      contentJson: body.content_json,
      correction: body.correction ?? false,
      request
    });

    return apiJson(201, created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(400, { error: error.issues[0]?.message ?? "Invalid payload." });
    }
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to create document version." });
  }
}



export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { id } = await context.params;

    const history = await listDocumentVersionHistory({
      organizationId: session.organizationId,
      documentId: id
    });

    return apiJson(200, history);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to list document version history." });
  }
}
