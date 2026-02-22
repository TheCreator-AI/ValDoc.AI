import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { verifyAuditChain } from "@/server/audit/chain";
import { writeAuditEvent } from "@/server/audit/events";
import { ApiError } from "@/server/api/http";
import { getRequiredEnv } from "@/server/config/env";

const reportDir = path.resolve(process.cwd(), "storage", "audit-verification-reports");

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
};

export type TamperEvidenceVerificationReport = {
  reportType: "AUDIT_TAMPER_EVIDENCE_VERIFICATION";
  reportVersion: "v1";
  organizationId: string;
  verifiedByUserId: string;
  verificationTimeUtc: string;
  rangeVerified: {
    dateFrom: string | null;
    dateTo: string | null;
    firstEventTimestamp: string | null;
    lastEventTimestamp: string | null;
    checkedEvents: number;
  };
  chainHead: {
    stored: string | null;
    computed: string | null;
  };
  result: {
    pass: boolean;
    firstBrokenEventId: string | null;
    failureReason: string | null;
  };
};

const parseDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildReport = (params: {
  organizationId: string;
  actorUserId: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  verifiedAt: Date;
  events: Array<{
    id: string;
    prevHash: string | null;
    eventHash: string | null;
    organizationId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    outcome: "SUCCESS" | "DENIED";
    metadataJson: string | null;
    detailsJson: string | null;
    ip: string | null;
    userAgent: string | null;
    timestamp: Date;
  }>;
  chainHeadStored: string | null;
}) => {
  const verification = verifyAuditChain(
    params.events.map((event) => ({
      id: event.id,
      prevHash: event.prevHash,
      eventHash: event.eventHash,
      payload: {
        organizationId: event.organizationId,
        actorUserId: event.actorUserId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        outcome: event.outcome,
        metadataJson: event.metadataJson,
        detailsJson: event.detailsJson,
        ip: event.ip,
        userAgent: event.userAgent,
        timestampIso: event.timestamp.toISOString()
      }
    }))
  );

  const chainHeadComputed = verification.ok ? (verification.headHash ?? null) : null;
  const report: TamperEvidenceVerificationReport = {
    reportType: "AUDIT_TAMPER_EVIDENCE_VERIFICATION",
    reportVersion: "v1",
    organizationId: params.organizationId,
    verifiedByUserId: params.actorUserId,
    verificationTimeUtc: params.verifiedAt.toISOString(),
    rangeVerified: {
      dateFrom: params.dateFrom?.toISOString() ?? null,
      dateTo: params.dateTo?.toISOString() ?? null,
      firstEventTimestamp: params.events[0]?.timestamp.toISOString() ?? null,
      lastEventTimestamp: params.events.at(-1)?.timestamp.toISOString() ?? null,
      checkedEvents: params.events.length
    },
    chainHead: {
      stored: params.chainHeadStored,
      computed: chainHeadComputed
    },
    result: {
      pass: verification.ok && (params.chainHeadStored ?? "") === (chainHeadComputed ?? ""),
      firstBrokenEventId: verification.ok ? null : verification.brokenEventId,
      failureReason: verification.ok
        ? (params.chainHeadStored ?? "") === (chainHeadComputed ?? "")
          ? null
          : "chain_head_mismatch"
        : verification.reason
    }
  };
  return report;
};

export const generateTamperEvidenceReport = async (params: {
  organizationId: string;
  actorUserId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  request?: Request;
}) => {
  const parsedFrom = parseDate(params.dateFrom);
  const parsedTo = parseDate(params.dateTo);
  if (params.dateFrom && !parsedFrom) throw new ApiError(400, "dateFrom must be a valid date.");
  if (params.dateTo && !parsedTo) throw new ApiError(400, "dateTo must be a valid date.");

  const [events, chainHead] = await Promise.all([
    prisma.auditEvent.findMany({
      where: {
        organizationId: params.organizationId,
        ...((parsedFrom || parsedTo)
          ? {
              timestamp: {
                ...(parsedFrom ? { gte: parsedFrom } : {}),
                ...(parsedTo ? { lte: parsedTo } : {})
              }
            }
          : {})
      },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      select: {
        id: true,
        prevHash: true,
        eventHash: true,
        organizationId: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        outcome: true,
        metadataJson: true,
        detailsJson: true,
        ip: true,
        userAgent: true,
        timestamp: true
      }
    }),
    prisma.auditChainHead.findUnique({
      where: { organizationId: params.organizationId },
      select: { headHash: true }
    })
  ]);

  const verifiedAt = new Date();
  const report = buildReport({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    dateFrom: parsedFrom,
    dateTo: parsedTo,
    verifiedAt,
    events,
    chainHeadStored: chainHead?.headHash ?? null
  });

  const reportJson = JSON.stringify(report, null, 2);
  const reportHash = createHash("sha256").update(reportJson).digest("hex");
  const signature = createHmac("sha256", getRequiredEnv().JWT_SECRET).update(canonicalize(report)).digest("hex");

  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `audit-verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  await fs.writeFile(reportPath, reportJson, "utf8");

  const persisted = await prisma.auditVerificationReport.create({
    data: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      verifiedAt,
      rangeStart: parsedFrom,
      rangeEnd: parsedTo,
      checkedEvents: report.rangeVerified.checkedEvents,
      chainHeadStored: report.chainHead.stored,
      chainHeadComputed: report.chainHead.computed,
      pass: report.result.pass,
      firstBrokenEventId: report.result.firstBrokenEventId,
      failureReason: report.result.failureReason,
      reportJson,
      reportHash,
      signature,
      reportPath
    },
    select: {
      id: true,
      reportHash: true,
      signature: true,
      pass: true,
      checkedEvents: true,
      reportPath: true
    }
  });

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "audit.verify_chain.report.generate",
    entityType: "AuditVerificationReport",
    entityId: persisted.id,
    details: {
      reportHash: persisted.reportHash,
      pass: persisted.pass,
      checkedEvents: persisted.checkedEvents
    },
    request: params.request
  });

  return {
    reportId: persisted.id,
    reportHash: persisted.reportHash,
    signature: persisted.signature,
    pass: persisted.pass,
    checkedEvents: persisted.checkedEvents,
    reportPath: persisted.reportPath
  };
};

export const getTamperEvidenceReportForDownload = async (params: {
  organizationId: string;
  actorUserId: string;
  reportId: string;
  request?: Request;
}) => {
  const report = await prisma.auditVerificationReport.findFirst({
    where: {
      id: params.reportId,
      organizationId: params.organizationId
    }
  });
  if (!report) throw new ApiError(404, "Tamper-evidence report not found.");

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "audit.verify_chain.report.download",
    entityType: "AuditVerificationReport",
    entityId: report.id,
    details: { reportHash: report.reportHash },
    request: params.request
  });

  return report;
};
