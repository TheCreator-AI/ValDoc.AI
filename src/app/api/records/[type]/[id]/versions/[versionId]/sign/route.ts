import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { writeAuditEvent } from "@/server/audit/events";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { hashRecordContent } from "@/server/signatures/manifest";
import { evaluateSignaturePolicy } from "@/server/signatures/policy";
import { evaluateApprovalSegregation } from "@/server/compliance/segregationOfDuties";

const payloadSchema = z.object({
  meaning: z.enum(["AUTHOR", "REVIEW", "APPROVE"]),
  password: z.string().min(1, "password is required."),
  remarks: z.string().optional(),
  emergency_override: z.boolean().optional(),
  override_justification: z.string().optional()
});

const toRecordType = (value: string) => {
  if (value === "generated-document") {
    return "GENERATED_DOCUMENT" as const;
  }
  throw new ApiError(400, "Unsupported record type.");
};

export async function POST(
  request: Request,
  context: { params: Promise<{ type: string; id: string; versionId: string }> }
) {
  const session = await getSessionOrThrow();
  const { type, id, versionId } = await context.params;
  let recordType = "GENERATED_DOCUMENT" as const;

  const logAttempt = async (params: { outcome: "SUCCESS" | "DENIED"; reason?: string; meaning?: string }) => {
    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "signature.attempt",
      entityType: "ElectronicSignature",
      entityId: `${recordType}:${id}:${versionId}`,
      outcome: params.outcome,
      details: {
        recordType,
        recordId: id,
        recordVersionId: versionId,
        meaning: params.meaning,
        reason: params.reason
      },
      request
    });
  };

  try {
    recordType = toRecordType(type);
    const body = payloadSchema.parse(await request.json());

    const user = await prisma.user.findFirst({
      where: {
        id: session.userId,
        organizationId: session.organizationId
      },
      select: { id: true, fullName: true, passwordHash: true }
    });

    if (!user) {
      await logAttempt({ outcome: "DENIED", reason: "user_not_found", meaning: body.meaning });
      return apiJson(401, { error: "Authentication required." });
    }

    const passwordValid = await compare(body.password, user.passwordHash);
    if (!passwordValid) {
      await logAttempt({ outcome: "DENIED", reason: "invalid_password", meaning: body.meaning });
      return apiJson(401, { error: "Password re-authentication failed." });
    }

    const targetVersion = await prisma.documentVersion.findFirst({
      where: {
        id: versionId,
        generatedDocumentId: id,
        generatedDocument: {
          organizationId: session.organizationId
        }
      },
      include: {
        generatedDocument: {
          select: { id: true, organizationId: true, status: true }
        }
      }
    });

    if (!targetVersion) {
      await logAttempt({ outcome: "DENIED", reason: "record_or_version_not_found", meaning: body.meaning });
      return apiJson(404, { error: "Record version not found." });
    }

    const policy = evaluateSignaturePolicy({
      role: session.role,
      meaning: body.meaning,
      recordState: targetVersion.generatedDocument.status
    });
    if (!policy.allowed) {
      await logAttempt({ outcome: "DENIED", reason: policy.reason, meaning: body.meaning });
      return apiJson(403, { error: "Signature meaning is not allowed for role or record state." });
    }

    const latestVersion = await prisma.documentVersion.findFirst({
      where: { generatedDocumentId: id },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true }
    });

    if (!latestVersion || latestVersion.id !== targetVersion.id) {
      await logAttempt({ outcome: "DENIED", reason: "non_latest_version", meaning: body.meaning });
      return apiJson(409, { error: "Only the latest version can be signed." });
    }

    if (body.meaning === "APPROVE") {
      const segregation = evaluateApprovalSegregation({
        actorRole: session.role,
        actorUserId: session.userId,
        authorUserId: targetVersion.editedByUserId,
        emergencyOverride: body.emergency_override,
        overrideJustification: body.override_justification
      });
      if (!segregation.allowed) {
        await logAttempt({ outcome: "DENIED", reason: segregation.reason, meaning: body.meaning });
        return apiJson(409, {
          error: `Two-person rule enforcement blocked final approval. ${segregation.remediation ?? ""}`.trim()
        });
      }

      if (segregation.overrideUsed) {
        await writeAuditEvent({
          organizationId: session.organizationId,
          actorUserId: session.userId,
          action: "signature.override.approval",
          entityType: "ElectronicSignature",
          entityId: `${recordType}:${id}:${versionId}`,
          details: {
            recordType,
            recordId: id,
            recordVersionId: versionId,
            authorUserId: targetVersion.editedByUserId,
            justification: segregation.normalizedJustification
          },
          request
        });
      }
    }

    const signatureManifest = hashRecordContent(targetVersion.contentSnapshot);

    const signature = await prisma.$transaction(async (tx) => {
      const created = await tx.electronicSignature.create({
        data: {
          organizationId: session.organizationId,
          recordType,
          recordId: id,
          recordVersionId: targetVersion.id,
          signerUserId: session.userId,
          signerFullName: user.fullName,
          meaning: body.meaning,
          authMethod: "PASSWORD_REAUTH",
          signatureManifest,
          remarks: body.remarks?.trim() || null
        }
      });

      await tx.documentVersion.update({
        where: { id: targetVersion.id },
        data: {
          contentHash: signatureManifest,
          signatureManifest
        }
      });

      if (body.meaning === "APPROVE") {
        await tx.generatedDocument.update({
          where: { id: id },
          data: { status: "APPROVED" }
        });
      }

      return created;
    });

    await logAttempt({ outcome: "SUCCESS", meaning: body.meaning });
    return apiJson(201, { signature });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAttempt({ outcome: "DENIED", reason: "invalid_payload" });
      return apiJson(400, { error: error.issues[0]?.message ?? "Invalid payload." });
    }
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    await logAttempt({ outcome: "DENIED", reason: "internal_error" });
    return apiJson(500, { error: "Failed to sign record version." });
  }
}
