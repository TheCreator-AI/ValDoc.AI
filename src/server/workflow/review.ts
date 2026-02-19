import { prisma } from "@/server/db/prisma";
import { writeAuditEvent } from "@/server/audit/events";
import { ApiError } from "@/server/api/http";
import { evaluateDocumentQualityGate, QualityGateFailureError } from "@/server/quality/documentQualityGate";
import { hashRecordContent } from "@/server/signatures/manifest";
import { diffJsonContent } from "@/server/audit/diff";

export const saveDocumentVersion = async (params: {
  organizationId: string;
  documentId: string;
  userId: string;
  updatedContent: string;
  changeComment?: string;
}) => {
  const { organizationId, documentId, userId, updatedContent, changeComment } = params;

  const document = await prisma.generatedDocument.findFirstOrThrow({
    where: { id: documentId, organizationId },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1
      }
    }
  });

  if (document.status === "APPROVED") {
    throw new ApiError(409, "Approved records are immutable. Create a new controlled record version.");
  }

  const latestVersion = document.versions[0] ?? null;
  const nextVersion = (latestVersion?.versionNumber ?? 0) + 1;

  await prisma.generatedDocument.update({
    where: { id: document.id },
    data: {
      currentContent: updatedContent,
      status: "IN_REVIEW"
    }
  });

  await prisma.documentVersion.create({
    data: {
      generatedDocumentId: document.id,
      editedByUserId: userId,
      versionNumber: nextVersion,
      state: "IN_REVIEW",
      contentSnapshot: updatedContent,
      contentHash: hashRecordContent(updatedContent),
      supersedesVersionId: latestVersion?.id ?? null,
      changeComment,
      changeReason: changeComment ?? "Manual edit from review UI"
    }
  });

  await writeAuditEvent({
    organizationId,
    actorUserId: userId,
    action: "document.version.create",
    entityType: "GeneratedDocument",
    entityId: document.id,
    details: {
      versionNumber: nextVersion,
      changeReason: changeComment ?? "Manual edit from review UI"
    },
    fieldChanges: diffJsonContent(document.currentContent, updatedContent)
  });

  return await prisma.generatedDocument.findFirstOrThrow({
    where: { id: document.id, organizationId },
    include: { versions: true }
  });
};

export const setReviewDecision = async (params: {
  organizationId: string;
  documentId: string;
  decision: "APPROVED" | "REJECTED";
  actorUserId: string;
  request?: Request;
}) => {
  const { organizationId, documentId, decision, actorUserId } = params;
  const doc = await prisma.generatedDocument.findFirstOrThrow({
    where: {
      id: documentId,
      organizationId
    },
    include: {
      generationJob: true
    }
  });

  if (decision === "APPROVED") {
    const packageDocs = await prisma.generatedDocument.findMany({
      where: {
        organizationId,
        generationJobId: doc.generationJobId
      }
    });
    const packageDocIds = packageDocs.map((item) => item.id);
    const traceLinks = await prisma.traceabilityLink.findMany({
      where: {
        organizationId,
        generatedDocumentId: {
          in: packageDocIds
        }
      }
    });

    const gate = evaluateDocumentQualityGate({
      targetDocumentId: doc.id,
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
      await writeAuditEvent({
        organizationId,
        actorUserId,
        action: "document.quality_gate.failed",
        entityType: "GeneratedDocument",
        entityId: doc.id,
        details: { issues: gate.issues },
        request: params.request
      });
      throw new QualityGateFailureError(gate.issues);
    }

    await writeAuditEvent({
      organizationId,
      actorUserId,
      action: "document.quality_gate.passed",
      entityType: "GeneratedDocument",
      entityId: doc.id,
      details: { checkedAt: gate.checkedAt },
      request: params.request
    });
  }

  return await prisma.generatedDocument.update({
    where: { id: doc.id },
    data: { status: decision }
  });
};
