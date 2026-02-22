import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";
import { searchChunks } from "@/server/search/indexer";

export async function GET(request: Request) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "equipment.read");
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();
    if (!query) {
      return apiJson(400, { error: "q is required." });
    }

    const results = await searchChunks(session.organizationId, query);
    return apiJson(200, {
      results: results.map((result) => ({
        id: result.id,
        pageNumber: result.pageNumber,
        sectionLabel: result.sectionLabel,
        chunkText: result.chunkText
      }))
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Search failed." });
  }
}
