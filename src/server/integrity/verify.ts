import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { ApiError } from "@/server/api/http";
import { prisma } from "@/server/db/prisma";
import { hashRecordContent } from "@/server/signatures/manifest";
import { ensureStoragePathIsSafe } from "@/server/files/storage";

const hashFileSha256 = async (filePath: string) => {
  ensureStoragePathIsSafe(filePath);
  const fileBuffer = await fs.readFile(filePath);
  return createHash("sha256").update(fileBuffer).digest("hex");
};

export const verifyDocumentVersionIntegrity = async (params: {
  organizationId: string;
  documentId: string;
  versionId: string;
}) => {
  const version = await prisma.documentVersion.findFirst({
    where: {
      id: params.versionId,
      generatedDocumentId: params.documentId,
      generatedDocument: {
        organizationId: params.organizationId
      }
    },
    select: {
      id: true,
      generatedDocumentId: true,
      contentSnapshot: true,
      contentHash: true
    }
  });

  if (!version) {
    throw new ApiError(404, "Document version not found.");
  }

  const computedHash = hashRecordContent(version.contentSnapshot);
  const storedHash = version.contentHash ?? "";

  return {
    versionId: version.id,
    documentId: version.generatedDocumentId,
    storedHash,
    computedHash,
    matches: storedHash === computedHash
  };
};

export const verifyDocumentExportIntegrity = async (params: {
  organizationId: string;
  documentId: string;
  exportId: string;
}) => {
  const exported = await prisma.documentExport.findFirst({
    where: {
      exportId: params.exportId,
      organizationId: params.organizationId,
      docId: params.documentId
    },
    select: {
      exportId: true,
      docId: true,
      hash: true,
      path: true,
      format: true
    }
  });

  if (!exported) {
    throw new ApiError(404, "Document export not found.");
  }

  const computedHash = await hashFileSha256(exported.path);

  return {
    exportId: exported.exportId,
    documentId: exported.docId,
    storedHash: exported.hash,
    computedHash,
    matches: exported.hash === computedHash,
    format: exported.format
  };
};
