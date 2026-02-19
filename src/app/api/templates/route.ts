import { DocType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";
import { saveUploadedFile } from "@/server/files/storage";
import { writeAuditEvent } from "@/server/audit/events";

type CreateTemplatePayload = {
  docType?: DocType;
  title?: string;
  contentTemplate?: string;
  templateKind?: "EXAMPLE" | "PRIMARY";
  isPrimary?: boolean;
};

const fallbackTemplate = (docType: DocType) =>
  `# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## ${docType} Section 1\n\n## ${docType} Section 2\n\n## Citations\n{{CITATIONS}}`;

const isTextLikeMime = (mimeType: string) => {
  const lower = mimeType.toLowerCase();
  return (
    lower.startsWith("text/") ||
    lower.includes("json") ||
    lower.includes("xml") ||
    lower.includes("markdown")
  );
};

export async function GET(request: Request) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "templates.read");

    const templates = await prisma.documentTemplate.findMany({
      where: { organizationId: session.organizationId },
      orderBy: [{ docType: "asc" }, { templateId: "asc" }, { version: "desc" }, { createdAt: "desc" }]
    });

    return apiJson(200, templates);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }

    return apiJson(500, { error: "Failed to list templates." });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "templates.create");
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const docTypeRaw = String(formData.get("docType") ?? "");
      if (!Object.values(DocType).includes(docTypeRaw as DocType)) {
        return apiJson(400, { error: "Valid docType is required." });
      }
      const docType = docTypeRaw as DocType;
      const files = formData
        .getAll("files")
        .filter((item): item is File => item instanceof File);

      if (files.length === 0) {
        return apiJson(400, { error: "At least one template file is required." });
      }
      if (files.length > 10) {
        return apiJson(400, { error: "Upload up to 10 template files at a time." });
      }

      const existingCount = await prisma.documentTemplate.count({
        where: {
          organizationId: session.organizationId,
          docType,
          templateKind: "EXAMPLE"
        }
      });
      if (existingCount + files.length > 10) {
        return apiJson(400, { error: `Maximum 10 example templates allowed for ${docType}.` });
      }

      const created = [];
      for (const file of files) {
        const stored = await saveUploadedFile(file, { kind: "TEMPLATE" });
        const rawContent = isTextLikeMime(stored.mimeType) ? await file.text() : "";
        const contentTemplate = rawContent.trim() ? rawContent : fallbackTemplate(docType);
        const template = await prisma.documentTemplate.create({
          data: {
            organizationId: session.organizationId,
            templateId: randomUUID(),
            version: 1,
            status: "DRAFT",
            createdByUserId: session.userId,
            docType,
            title: file.name,
            contentTemplate,
            templateKind: "EXAMPLE",
            isPrimary: false,
            sourceFileName: stored.fileName,
            sourceFilePath: stored.filePath,
            sourceMimeType: stored.mimeType
          }
        });
        created.push(template);
        await writeAuditEvent({
          organizationId: session.organizationId,
          actorUserId: session.userId,
          action: "template.create",
          entityType: "DocumentTemplate",
          entityId: template.id,
          details: { docType, title: template.title, templateKind: template.templateKind },
          request
        });
      }

      return apiJson(201, { created });
    }

    const body = (await request.json()) as CreateTemplatePayload;
    if (body.docType || body.title || body.contentTemplate) {
      return apiJson(400, {
        error: "Direct text template save is disabled. Upload PDF/Word template files to store templates."
      });
    }
    return apiJson(400, { error: "Unsupported template save request." });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    const details = error instanceof Error ? error.message : "Unknown error";
    return apiJson(500, { error: `Failed to save template. ${details}` });
  }
}
