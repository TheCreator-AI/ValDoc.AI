import { DocType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { buildTemplateSuggestions } from "@/server/templates/suggestions";

const parseDocType = (value: string | null): DocType | null => {
  if (!value) return null;
  if (Object.values(DocType).includes(value as DocType)) return value as DocType;
  return null;
};

export async function GET(request: Request) {
  try {
    const session = await getSessionOrThrow();
    const { searchParams } = new URL(request.url);
    const docType = parseDocType(searchParams.get("docType"));

    if (!docType) {
      return apiJson(400, { error: "docType is required and must be valid." });
    }

    const [templates, generatedDocs] = await Promise.all([
      prisma.documentTemplate.findMany({
        where: { organizationId: session.organizationId, docType },
        select: { contentTemplate: true }
      }),
      prisma.generatedDocument.findMany({
        where: { organizationId: session.organizationId, docType },
        select: { currentContent: true },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    ]);

    const samples = [
      ...templates.map((template) => template.contentTemplate),
      ...generatedDocs.map((doc) => doc.currentContent)
    ].filter(Boolean);

    const suggestions = buildTemplateSuggestions({ docType, samples });
    return apiJson(200, suggestions);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to generate template suggestions." });
  }
}
