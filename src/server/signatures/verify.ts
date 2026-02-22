import { prisma } from "@/server/db/prisma";
import { ApiError } from "@/server/api/http";
import { hashRecordContent } from "@/server/signatures/manifest";

export const verifyElectronicSignatureBinding = async (params: {
  organizationId: string;
  signatureId: string;
}) => {
  const signature = await prisma.electronicSignature.findFirst({
    where: {
      id: params.signatureId,
      organizationId: params.organizationId
    },
    select: {
      id: true,
      recordId: true,
      recordVersionId: true,
      signatureManifest: true
    }
  });

  if (!signature) {
    throw new ApiError(404, "Electronic signature not found.");
  }

  const version = await prisma.documentVersion.findFirst({
    where: {
      id: signature.recordVersionId,
      generatedDocumentId: signature.recordId,
      generatedDocument: {
        organizationId: params.organizationId
      }
    },
    select: {
      id: true,
      state: true,
      contentSnapshot: true
    }
  });

  if (!version) {
    return {
      signatureId: signature.id,
      valid: false,
      reason: "missing_record_version"
    };
  }

  const computedManifest = hashRecordContent(version.contentSnapshot);
  const valid = computedManifest === signature.signatureManifest;

  return {
    signatureId: signature.id,
    versionId: version.id,
    state: version.state,
    valid,
    storedManifest: signature.signatureManifest,
    computedManifest,
    reason: valid ? "ok" : "content_manifest_mismatch"
  };
};

