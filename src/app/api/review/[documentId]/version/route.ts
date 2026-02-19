import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { saveDocumentVersion } from "@/server/workflow/review";

export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await getSessionOrThrow("ENGINEER");
    const { documentId } = await context.params;
    const body = (await request.json()) as { content?: string; comment?: string };

    if (!body.content) {
      return apiJson(400, { error: "content is required." });
    }

    const updated = await saveDocumentVersion({
      organizationId: session.organizationId,
      documentId,
      userId: session.userId,
      updatedContent: body.content,
      changeComment: body.comment
    });

    return apiJson(200, updated);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to save document version." });
  }
}
