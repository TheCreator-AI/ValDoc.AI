import type { DocumentVersionState, Role } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { ApiError } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";
import { hashRecordContent } from "@/server/signatures/manifest";
import { evaluateApprovalSegregation } from "@/server/compliance/segregationOfDuties";
import { diffJsonContent } from "@/server/audit/diff";

const transitionMatrix: Record<DocumentVersionState, DocumentVersionState[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["DRAFT", "APPROVED"],
  APPROVED: ["OBSOLETE"],
  OBSOLETE: []
};

const allowsObsoleteWithJustification = () => (process.env.ALLOW_OBSOLETE_WITH_JUSTIFICATION ?? "true").toLowerCase() !== "false";

export const createDocumentVersion = async (params: {
  organizationId: string;
  documentId: string;
  actorUserId: string;
  changeReason: string;
  contentJson?: string;
  request?: Request;
}) => {
  const latest = await prisma.documentVersion.findFirst({
    where: {
      generatedDocumentId: params.documentId,
      generatedDocument: { organizationId: params.organizationId }
    },
    orderBy: { versionNumber: "desc" }
  });

  if (!latest) {
    throw new ApiError(404, "Document version history not found.");
  }
  if (latest.state === "APPROVED") {
    throw new ApiError(409, "Approved versions are immutable. Create a successor draft version.");
  }

  const nextContent = params.contentJson ?? latest.contentSnapshot;
  const created = await prisma.documentVersion.create({
    data: {
      generatedDocumentId: params.documentId,
      editedByUserId: params.actorUserId,
      versionNumber: latest.versionNumber + 1,
      state: "DRAFT",
      contentSnapshot: nextContent,
      contentHash: hashRecordContent(nextContent),
      supersedesVersionId: latest.id,
      changeReason: params.changeReason,
      changeComment: params.changeReason
    }
  });

  await prisma.generatedDocument.update({
    where: { id: params.documentId },
    data: { currentContent: nextContent, status: "DRAFT" }
  });

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "document.version.create",
    entityType: "DocumentVersion",
    entityId: created.id,
    details: {
      documentId: params.documentId,
      supersedesVersionId: latest.id,
      versionNumber: created.versionNumber,
      state: created.state,
      changeReason: params.changeReason
    },
    fieldChanges: diffJsonContent(latest.contentSnapshot, nextContent),
    request: params.request
  });

  return created;
};

export const transitionDocumentVersionState = async (params: {
  organizationId: string;
  documentId: string;
  versionId: string;
  actorUserId: string;
  actorRole: Role;
  toState: DocumentVersionState;
  replacementVersionId?: string;
  justification?: string;
  emergencyOverride?: boolean;
  overrideJustification?: string;
  request?: Request;
}) => {
  const version = await prisma.documentVersion.findFirst({
    where: {
      id: params.versionId,
      generatedDocumentId: params.documentId,
      generatedDocument: { organizationId: params.organizationId }
    }
  });

  if (!version) {
    throw new ApiError(404, "Document version not found.");
  }

  const allowedTargets = transitionMatrix[version.state];
  if (!allowedTargets.includes(params.toState)) {
    throw new ApiError(409, `Invalid transition: ${version.state} -> ${params.toState}.`);
  }

  if (params.toState === "OBSOLETE") {
    const hasReplacement = Boolean(params.replacementVersionId?.trim());
    const hasJustification = Boolean(params.justification?.trim());
    if (!hasReplacement && (!allowsObsoleteWithJustification() || !hasJustification)) {
      throw new ApiError(400, "OBSOLETE requires replacement version reference or justification.");
    }
  }

  if (params.toState === "APPROVED") {
    if (params.actorRole !== "REVIEWER" && params.actorRole !== "ADMIN") {
      throw new ApiError(403, "Only Reviewer/Admin can approve document versions.");
    }
    const segregation = evaluateApprovalSegregation({
      actorRole: params.actorRole,
      actorUserId: params.actorUserId,
      authorUserId: version.editedByUserId,
      emergencyOverride: params.emergencyOverride,
      overrideJustification: params.overrideJustification
    });
    if (!segregation.allowed) {
      throw new ApiError(
        409,
        `Two-person rule enforcement blocked final approval. ${segregation.remediation ?? ""}`.trim()
      );
    }
    if (segregation.overrideUsed) {
      await writeAuditEvent({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: "document.version.transition.override",
        entityType: "DocumentVersion",
        entityId: version.id,
        details: {
          documentId: params.documentId,
          versionId: version.id,
          authorUserId: version.editedByUserId,
          justification: segregation.normalizedJustification
        },
        request: params.request
      });
    }
  }

  const updated = await prisma.documentVersion.update({
    where: { id: version.id },
    data: {
      state: params.toState,
      changeComment:
        params.toState === "OBSOLETE"
          ? [params.replacementVersionId ? `replacement=${params.replacementVersionId}` : "", params.justification ?? ""]
              .filter(Boolean)
              .join(" | ")
          : version.changeComment
    }
  });

  if (params.toState === "APPROVED") {
    await prisma.generatedDocument.update({
      where: { id: params.documentId },
      data: { status: "APPROVED" }
    });
  }
  if (params.toState === "IN_REVIEW") {
    await prisma.generatedDocument.update({
      where: { id: params.documentId },
      data: { status: "IN_REVIEW" }
    });
  }
  if (params.toState === "DRAFT") {
    await prisma.generatedDocument.update({
      where: { id: params.documentId },
      data: { status: "DRAFT" }
    });
  }

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "document.version.transition",
    entityType: "DocumentVersion",
    entityId: version.id,
    details: {
      documentId: params.documentId,
      oldState: version.state,
      newState: params.toState,
      replacementVersionId: params.replacementVersionId ?? null,
      justification: params.justification ?? null
    },
    fieldChanges: [
      {
        changePath: "state",
        oldValue: version.state,
        newValue: params.toState
      }
    ],
    request: params.request
  });

  return updated;
};
