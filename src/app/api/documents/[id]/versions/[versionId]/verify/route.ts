import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { verifyDocumentVersionIntegrity } from "@/server/integrity/verify";

export async function GET(_request: Request, context: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const session = await getSessionOrThrow("VIEWER");
    const { id, versionId } = await context.params;
    const result = await verifyDocumentVersionIntegrity({
      organizationId: session.organizationId,
      documentId: id,
      versionId
    });
    return apiJson(200, result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to verify document version integrity." });
  }
}
