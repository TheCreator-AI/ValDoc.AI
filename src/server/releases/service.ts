import { compare } from "bcryptjs";
import { hashRecordContent } from "@/server/signatures/manifest";
import { prisma } from "@/server/db/prisma";
import { ApiError } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

type ReleasePayload = {
  buildVersion: string;
  releaseDate: Date;
  changeSummary: string;
  riskImpact: string;
  deployedAt: Date | null;
};

export const createReleaseEntry = async (params: {
  organizationId: string;
  actorUserId: string;
  payload: ReleasePayload;
  request?: Request;
}) => {
  const created = await prisma.appRelease.create({
    data: {
      organizationId: params.organizationId,
      buildVersion: params.payload.buildVersion,
      releaseDate: params.payload.releaseDate,
      changeSummary: params.payload.changeSummary,
      riskImpact: params.payload.riskImpact,
      deployedAt: params.payload.deployedAt,
      createdByUserId: params.actorUserId
    }
  });

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "release.create",
    entityType: "AppRelease",
    entityId: created.id,
    details: {
      buildVersion: created.buildVersion
    },
    request: params.request
  });

  return created;
};

export const updateReleaseEntry = async (params: {
  organizationId: string;
  releaseId: string;
  actorUserId: string;
  patch: {
    changeSummary?: string;
    riskImpact?: string;
    deployedAt?: Date | null;
  };
  request?: Request;
}) => {
  const existing = await prisma.appRelease.findFirst({
    where: {
      id: params.releaseId,
      organizationId: params.organizationId
    },
    select: {
      id: true,
      approvedSignatureId: true
    }
  });

  if (!existing) {
    throw new ApiError(404, "Release entry not found.");
  }

  if (existing.approvedSignatureId) {
    throw new ApiError(409, "Signed release entries are immutable.");
  }

  const updated = await prisma.appRelease.update({
    where: { id: existing.id },
    data: params.patch
  });

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "release.update",
    entityType: "AppRelease",
    entityId: existing.id,
    details: params.patch,
    request: params.request
  });

  return updated;
};

export const signReleaseEntry = async (params: {
  organizationId: string;
  releaseId: string;
  actorUserId: string;
  password: string;
  remarks?: string;
  request?: Request;
}) => {
  const release = await prisma.appRelease.findFirst({
    where: {
      id: params.releaseId,
      organizationId: params.organizationId
    },
    select: {
      id: true,
      buildVersion: true,
      releaseDate: true,
      changeSummary: true,
      riskImpact: true,
      deployedAt: true,
      approvedSignatureId: true
    }
  });

  if (!release) {
    throw new ApiError(404, "Release entry not found.");
  }

  if (release.approvedSignatureId) {
    throw new ApiError(409, "Release entry is already signed.");
  }

  const user = await prisma.user.findFirst({
    where: {
      id: params.actorUserId,
      organizationId: params.organizationId
    },
    select: {
      id: true,
      fullName: true,
      passwordHash: true
    }
  });

  if (!user) {
    throw new ApiError(401, "Authentication required.");
  }

  const passwordValid = await compare(params.password, user.passwordHash);
  if (!passwordValid) {
    await writeAuditEvent({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: "release.sign",
      entityType: "AppRelease",
      entityId: params.releaseId,
      outcome: "DENIED",
      details: { reason: "invalid_password" },
      request: params.request
    });
    throw new ApiError(401, "Password re-authentication failed.");
  }

  const signatureManifest = hashRecordContent(
    JSON.stringify({
      id: release.id,
      buildVersion: release.buildVersion,
      releaseDate: release.releaseDate.toISOString(),
      changeSummary: release.changeSummary,
      riskImpact: release.riskImpact,
      deployedAt: release.deployedAt?.toISOString() ?? null
    })
  );

  const signed = await prisma.$transaction(async (tx) => {
    const signature = await tx.electronicSignature.create({
      data: {
        organizationId: params.organizationId,
        recordType: "APP_RELEASE",
        recordId: release.id,
        recordVersionId: release.id,
        signerUserId: params.actorUserId,
        signerFullName: user.fullName,
        meaning: "APPROVE",
        authMethod: "PASSWORD_REAUTH",
        signatureManifest,
        remarks: params.remarks?.trim() || null
      }
    });

    return await tx.appRelease.update({
      where: { id: release.id },
      data: {
        approvedSignatureId: signature.id,
        approvedByUserId: params.actorUserId,
        deployedAt: release.deployedAt ?? new Date()
      }
    });
  });

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "release.sign",
    entityType: "AppRelease",
    entityId: release.id,
    details: {
      approvedSignatureId: signed.approvedSignatureId
    },
    request: params.request
  });

  return signed;
};

export const listReleaseEntries = async (organizationId: string) => {
  return await prisma.appRelease.findMany({
    where: { organizationId },
    orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
    include: {
      approvedSignature: {
        select: {
          id: true,
          signerFullName: true,
          signedAt: true,
          signatureManifest: true
        }
      }
    }
  });
};
