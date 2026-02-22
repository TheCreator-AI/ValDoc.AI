import { compare } from "bcryptjs";
import type { ReviewStatus } from "@prisma/client";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { writeAuditEvent } from "@/server/audit/events";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { hashRecordContent } from "@/server/signatures/manifest";
import { evaluateSignaturePolicy } from "@/server/signatures/policy";
import { evaluateApprovalSegregation } from "@/server/compliance/segregationOfDuties";
import { checkAndConsumeRateLimit } from "@/server/security/rateLimit";
import { transitionDocumentVersionState } from "@/server/documents/lifecycle";

const payloadSchema = z.object({
  meaning: z.enum(["AUTHOR", "REVIEW", "APPROVE"]),
  password: z.string().min(1, "password is required.").optional(),
  mfa_code: z.string().regex(/^\d{6}$/, "mfa_code must be 6 digits.").optional(),
  remarks: z.string().optional(),
  emergency_override: z.boolean().optional(),
  override_justification: z.string().optional()
}).superRefine((value, ctx) => {
  if (!value.password && !value.mfa_code) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: "password or mfa_code is required."
    });
  }
  if ((value.meaning === "REVIEW" || value.meaning === "APPROVE") && !value.remarks?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["remarks"],
      message: "remarks are required for REVIEW and APPROVE signatures."
    });
  }
});

const toRecordType = (value: string) => {
  if (value === "generated-document") {
    return "GENERATED_DOCUMENT" as const;
  }
  throw new ApiError(400, "Unsupported record type.");
};

const verifyMfaCode = (code: string) => {
  const configured = process.env.SIGNATURE_MFA_CODE;
  if (!configured) {
    return false;
  }
  const left = Buffer.from(configured);
  const right = Buffer.from(code);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

export async function POST(
  request: Request,
  context: { params: Promise<{ type: string; id: string; versionId: string }> }
) {
  const session = await getSessionOrThrow();
  const rateLimit = checkAndConsumeRateLimit({
    key: `signature:${session.organizationId}:${session.userId}`,
    limit: 20,
    windowMs: 10 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return apiJson(429, { error: "Signature rate limit exceeded. Please retry later." });
  }
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
      select: { id: true, fullName: true, passwordHash: true, mfaEnabled: true }
    });

    if (!user) {
      await logAttempt({ outcome: "DENIED", reason: "user_not_found", meaning: body.meaning });
      return apiJson(401, { error: "Authentication required." });
    }

    let authMethod: "PASSWORD_REAUTH" | "MFA_REAUTH" = "PASSWORD_REAUTH";
    const passwordValid = body.password ? await compare(body.password, user.passwordHash) : false;
    const mfaValid =
      Boolean(body.mfa_code) && Boolean(user.mfaEnabled) && verifyMfaCode(body.mfa_code ?? "");

    if (!passwordValid && !mfaValid) {
      await logAttempt({ outcome: "DENIED", reason: "invalid_password", meaning: body.meaning });
      return apiJson(401, { error: "Re-authentication failed. Provide password or valid MFA code." });
    }
    authMethod = passwordValid ? "PASSWORD_REAUTH" : "MFA_REAUTH";

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

    const signatureRecordState: ReviewStatus = targetVersion.state === "OBSOLETE" ? "REJECTED" : targetVersion.state;

    const policy = evaluateSignaturePolicy({
      role: session.role,
      meaning: body.meaning,
      recordState: signatureRecordState
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
          authMethod,
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

      return created;
    });

    if (body.meaning === "APPROVE") {
      await transitionDocumentVersionState({
        organizationId: session.organizationId,
        documentId: id,
        versionId: targetVersion.id,
        actorUserId: session.userId,
        actorRole: session.role,
        toState: "APPROVED",
        emergencyOverride: body.emergency_override,
        overrideJustification: body.override_justification,
        request
      });
    }

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
