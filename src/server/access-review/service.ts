import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { compare } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { hashRecordContent } from "@/server/signatures/manifest";
import { ApiError } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";

type AccessReviewUserRow = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: "ACTIVE" | "LOCKED";
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export type AccessReviewReportPayload = {
  metadata: {
    reportType: "USER_ACCESS_REVIEW";
    reportVersion: "v1";
    organizationId: string;
    organizationName: string;
    generatedAt: string;
    generatedBy: string;
  };
  users: Array<{
    userId: string;
    email: string;
    fullName: string;
    role: string;
    status: "ACTIVE" | "LOCKED";
    lastLogin: string | null;
    mfaEnabled: boolean;
    createdAt: string;
  }>;
};

const reportDir = path.resolve(process.cwd(), "storage", "reports");

const csvEscape = (value: string) => {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
};

export const buildAccessReviewReportPayload = (params: {
  organization: { id: string; name: string };
  generatedBy: string;
  generatedAt: Date;
  users: AccessReviewUserRow[];
}): AccessReviewReportPayload => {
  return {
    metadata: {
      reportType: "USER_ACCESS_REVIEW",
      reportVersion: "v1",
      organizationId: params.organization.id,
      organizationName: params.organization.name,
      generatedAt: params.generatedAt.toISOString(),
      generatedBy: params.generatedBy
    },
    users: params.users.map((user) => ({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      lastLogin: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt.toISOString()
    }))
  };
};

export const buildAccessReviewReportCsv = (payload: AccessReviewReportPayload) => {
  const rows = [
    "users,roles,status,last_login,mfa_enabled,created_at",
    ...payload.users.map((user) =>
      [
        csvEscape(user.email),
        csvEscape(user.role),
        csvEscape(user.status),
        csvEscape(user.lastLogin ?? ""),
        user.mfaEnabled ? "true" : "false",
        csvEscape(user.createdAt)
      ].join(",")
    )
  ];
  return rows.join("\n");
};

export const listAccessReviewReports = async (organizationId: string) => {
  return await prisma.accessReviewReport.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reportHash: true,
      reportFormat: true,
      createdAt: true,
      attestedAt: true,
      attestedSignatureId: true
    }
  });
};

export const generateAccessReviewReport = async (params: {
  organizationId: string;
  actorUserId: string;
  actorEmail: string;
  request?: Request;
}) => {
  const [organization, users] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: params.organizationId },
      select: { id: true, name: true }
    }),
    prisma.user.findMany({
      where: { organizationId: params.organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        userStatus: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true
      }
    })
  ]);

  if (!organization) {
    throw new ApiError(404, "Organization not found.");
  }

  const payload = buildAccessReviewReportPayload({
    organization,
    generatedBy: params.actorEmail,
    generatedAt: new Date(),
    users: users.map((user) => ({
      ...user,
      status: user.userStatus
    }))
  });

  const reportJson = JSON.stringify(payload);
  const reportHash = hashRecordContent(reportJson);
  const reportCsv = buildAccessReviewReportCsv(payload);

  await fs.mkdir(reportDir, { recursive: true });
  const reportId = randomUUID();
  const reportPath = path.join(reportDir, `${reportId}.csv`);
  await fs.writeFile(reportPath, reportCsv, "utf8");

  const created = await prisma.accessReviewReport.create({
    data: {
      id: reportId,
      organizationId: params.organizationId,
      generatedByUserId: params.actorUserId,
      reportJson,
      reportHash,
      reportPath,
      reportFormat: "csv"
    },
    select: {
      id: true,
      reportHash: true,
      reportFormat: true,
      reportPath: true,
      createdAt: true
    }
  });

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "access_review.report.generate",
    entityType: "AccessReviewReport",
    entityId: created.id,
    details: { reportHash: created.reportHash, format: created.reportFormat },
    request: params.request
  });

  return created;
};

export const getAccessReviewReportForDownload = async (params: {
  organizationId: string;
  actorUserId: string;
  reportId: string;
  request?: Request;
}) => {
  const report = await prisma.accessReviewReport.findFirst({
    where: { id: params.reportId, organizationId: params.organizationId },
    select: {
      id: true,
      reportPath: true,
      reportFormat: true
    }
  });
  if (!report) {
    throw new ApiError(404, "Access review report not found.");
  }

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "access_review.report.download",
    entityType: "AccessReviewReport",
    entityId: report.id,
    request: params.request
  });

  return report;
};

export const createAccessReviewAttestationRecord = async (params: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  actor: { userId: string; fullName: string };
  report: { id: string; reportHash: string };
  remarks?: string;
}) => {
  const signature = await params.tx.electronicSignature.create({
    data: {
      organizationId: params.organizationId,
      recordType: "ACCESS_REVIEW_REPORT",
      recordId: params.report.id,
      recordVersionId: params.report.id,
      signerUserId: params.actor.userId,
      signerFullName: params.actor.fullName,
      meaning: "APPROVE",
      authMethod: "PASSWORD_REAUTH",
      signatureManifest: params.report.reportHash,
      remarks: params.remarks?.trim() || null
    }
  });

  await params.tx.accessReviewReport.update({
    where: { id: params.report.id },
    data: {
      attestedSignatureId: signature.id,
      attestedAt: new Date()
    }
  });

  return signature;
};

export const attestAccessReviewReport = async (params: {
  organizationId: string;
  reportId: string;
  actorUserId: string;
  password: string;
  remarks?: string;
  request?: Request;
}) => {
  const [user, report] = await Promise.all([
    prisma.user.findFirst({
      where: { id: params.actorUserId, organizationId: params.organizationId },
      select: { id: true, fullName: true, passwordHash: true }
    }),
    prisma.accessReviewReport.findFirst({
      where: { id: params.reportId, organizationId: params.organizationId },
      select: { id: true, reportHash: true, attestedSignatureId: true }
    })
  ]);

  if (!user || !report) {
    throw new ApiError(404, "Access review report or user not found.");
  }
  if (report.attestedSignatureId) {
    throw new ApiError(409, "Report has already been attested.");
  }

  const passwordValid = await compare(params.password, user.passwordHash);
  if (!passwordValid) {
    await writeAuditEvent({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: "access_review.attestation",
      entityType: "AccessReviewReport",
      entityId: params.reportId,
      outcome: "DENIED",
      details: { reason: "invalid_password" },
      request: params.request
    });
    throw new ApiError(401, "Password re-authentication failed.");
  }

  const signature = await prisma.$transaction(async (tx) =>
    createAccessReviewAttestationRecord({
      tx,
      organizationId: params.organizationId,
      actor: { userId: user.id, fullName: user.fullName },
      report: { id: report.id, reportHash: report.reportHash },
      remarks: params.remarks
    })
  );

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "access_review.attestation",
    entityType: "AccessReviewReport",
    entityId: params.reportId,
    outcome: "SUCCESS",
    details: {
      signatureId: signature.id,
      reportHash: report.reportHash
    },
    request: params.request
  });

  return {
    reportId: report.id,
    signatureId: signature.id,
    reportHash: report.reportHash
  };
};

