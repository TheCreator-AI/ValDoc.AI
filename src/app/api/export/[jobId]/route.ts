import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { prisma } from "@/server/db/prisma";
import { evaluateDocumentQualityGate } from "@/server/quality/documentQualityGate";
import {
  exportDocumentAsDocxWithMetadata,
  exportDocumentAsPdfWithMetadata,
  exportJobAsZip,
  fileToResponse
} from "@/server/export/packageExporter";
import { writeAuditEvent } from "@/server/audit/events";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const session = await getSessionOrThrow();
    const { jobId } = await context.params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "zip";
    const documentId = url.searchParams.get("documentId");

    if (format === "zip") {
      const filePath = await exportJobAsZip(session.organizationId, jobId);
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: "document.export.zip",
        entityType: "GenerationJob",
        entityId: jobId,
        details: { format: "zip" },
        request
      });
      return await fileToResponse(filePath, "application/zip");
    }

    if (!documentId) {
      return apiJson(400, { error: "documentId is required for docx/pdf exports." });
    }

    if (format === "pdf") {
      const exported = await exportDocumentAsPdfWithMetadata({
        organizationId: session.organizationId,
        documentId,
        createdByUserId: session.userId
      });
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: "document.export.pdf",
        entityType: "GeneratedDocument",
        entityId: documentId,
        details: { title: exported.title },
        request
      });
      return await fileToResponse(exported.filePath, "application/pdf", exported.title);
    }

    if (format === "docx") {
      const packageDocs = await prisma.generatedDocument.findMany({
        where: {
          organizationId: session.organizationId,
          generationJobId: jobId
        }
      });
      const traceLinks = await prisma.traceabilityLink.findMany({
        where: {
          organizationId: session.organizationId,
          generatedDocumentId: { in: packageDocs.map((item) => item.id) }
        }
      });
      const gate = evaluateDocumentQualityGate({
        targetDocumentId: documentId,
        documents: packageDocs.map((item) => ({
          id: item.id,
          docType: item.docType,
          currentContent: item.currentContent
        })),
        traceLinks: traceLinks.map((item) => ({
          requirementId: item.requirementId,
          riskControlId: item.riskControlId,
          testCaseId: item.testCaseId
        }))
      });
      if (!gate.ready) {
        return apiJson(422, { error: "Document is not ready for DOCX export.", issues: gate.issues });
      }

      const exported = await exportDocumentAsDocxWithMetadata({
        organizationId: session.organizationId,
        documentId,
        createdByUserId: session.userId
      });
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: "document.export.docx",
        entityType: "GeneratedDocument",
        entityId: documentId,
        details: { title: exported.title },
        request
      });
      return await fileToResponse(
        exported.filePath,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        exported.title
      );
    }

    return apiJson(400, { error: "Unsupported format." });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Export failed." });
  }
}
