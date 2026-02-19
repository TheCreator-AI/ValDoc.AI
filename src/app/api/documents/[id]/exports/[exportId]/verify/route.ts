import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { verifyDocumentExportIntegrity } from "@/server/integrity/verify";

export async function GET(_request: Request, context: { params: Promise<{ id: string; exportId: string }> }) {
  try {
    const session = await getSessionOrThrow("VIEWER");
    const { id, exportId } = await context.params;
    const result = await verifyDocumentExportIntegrity({
      organizationId: session.organizationId,
      documentId: id,
      exportId
    });
    return apiJson(200, result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to verify document export integrity." });
  }
}
