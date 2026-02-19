import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { getRequiredEnv } from "@/server/config/env";
import { writeAuditEvent } from "@/server/audit/events";

type NullableDays = number | null;

export type RetentionPolicyConfig = {
  auditEventRetentionDays: NullableDays;
  documentVersionRetentionDays: NullableDays;
  legalHoldEnabled: boolean;
};

type PurgePlanInput = {
  now: Date;
  policy: Pick<RetentionPolicyConfig, "auditEventRetentionDays" | "documentVersionRetentionDays">;
  generatedDocuments: Array<{ id: string; createdAt: Date; deletedAt: Date | null }>;
  documentVersions: Array<{ id: string; generatedDocumentId: string; createdAt: Date; deletedAt: Date | null }>;
  auditEvents: Array<{ id: string; timestamp: Date }>;
  legalHolds: Array<{ recordType: string; recordId: string; recordVersionId: string | null; isActive: boolean }>;
};

export type PurgePlan = {
  generatedDocuments: { toDeleteIds: string[]; blockedByHoldIds: string[] };
  documentVersions: { toDeleteIds: string[]; blockedByHoldIds: string[] };
  auditEvents: { toDeleteIds: string[]; blockedByHoldIds: string[]; blockedReason: string | null };
};

const defaultRetention = (): RetentionPolicyConfig => ({
  auditEventRetentionDays: Number.parseInt(process.env.AUDIT_RETENTION_DAYS ?? "", 10) || 2555,
  documentVersionRetentionDays: null,
  legalHoldEnabled: true
});

const toCutoff = (now: Date, days: NullableDays) => {
  if (days == null) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
};

const holdKeyFor = (recordType: string, recordId: string, recordVersionId?: string | null) =>
  `${recordType}:${recordId}:${recordVersionId ?? ""}`;

export const buildRetentionPurgePlan = (input: PurgePlanInput): PurgePlan => {
  const activeHolds = new Set(
    input.legalHolds.filter((hold) => hold.isActive).map((hold) => holdKeyFor(hold.recordType, hold.recordId, hold.recordVersionId))
  );
  const docCutoff = toCutoff(input.now, input.policy.documentVersionRetentionDays);
  const auditCutoff = toCutoff(input.now, input.policy.auditEventRetentionDays);

  const generatedDocuments = { toDeleteIds: [] as string[], blockedByHoldIds: [] as string[] };
  if (docCutoff) {
    for (const document of input.generatedDocuments) {
      if (document.deletedAt || document.createdAt >= docCutoff) continue;
      if (activeHolds.has(holdKeyFor("GENERATED_DOCUMENT", document.id))) {
        generatedDocuments.blockedByHoldIds.push(document.id);
        continue;
      }
      generatedDocuments.toDeleteIds.push(document.id);
    }
  }

  const documentVersions = { toDeleteIds: [] as string[], blockedByHoldIds: [] as string[] };
  if (docCutoff) {
    for (const version of input.documentVersions) {
      if (version.deletedAt || version.createdAt >= docCutoff) continue;
      if (
        activeHolds.has(holdKeyFor("DOCUMENT_VERSION", version.generatedDocumentId, version.id)) ||
        activeHolds.has(holdKeyFor("GENERATED_DOCUMENT", version.generatedDocumentId))
      ) {
        documentVersions.blockedByHoldIds.push(version.id);
        continue;
      }
      documentVersions.toDeleteIds.push(version.id);
    }
  }

  // audit_events are append-only (Part 11 + tamper-evident chain), so retention is report-only.
  const auditEvents = {
    toDeleteIds: [] as string[],
    blockedByHoldIds: auditCutoff ? input.auditEvents.filter((event) => event.timestamp < auditCutoff).map((event) => event.id) : [],
    blockedReason: "Audit events are append-only and cannot be deleted; retention is advisory/report-only."
  };

  return { generatedDocuments, documentVersions, auditEvents };
};

const normalizeDays = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Retention days must be a positive integer or null.");
  }
  return Math.floor(parsed);
};

const reportDir = path.resolve(process.cwd(), "storage", "retention-reports");

export const getRetentionConfiguration = async (organizationId: string): Promise<RetentionPolicyConfig> => {
  const existing = await prisma.retentionPolicy.findUnique({
    where: { organizationId }
  });
  if (!existing) {
    const fallback = defaultRetention();
    await prisma.retentionPolicy.create({
      data: {
        organizationId,
        auditEventRetentionDays: fallback.auditEventRetentionDays,
        documentVersionRetentionDays: fallback.documentVersionRetentionDays,
        legalHoldEnabled: fallback.legalHoldEnabled
      }
    });
    return fallback;
  }
  return {
    auditEventRetentionDays: existing.auditEventRetentionDays,
    documentVersionRetentionDays: existing.documentVersionRetentionDays,
    legalHoldEnabled: existing.legalHoldEnabled
  };
};

export const updateRetentionConfiguration = async (params: {
  organizationId: string;
  actorUserId: string;
  auditEventRetentionDays?: unknown;
  documentVersionRetentionDays?: unknown;
  legalHoldEnabled?: unknown;
  request: Request;
}) => {
  const data = {
    auditEventRetentionDays:
      params.auditEventRetentionDays === undefined ? undefined : normalizeDays(params.auditEventRetentionDays),
    documentVersionRetentionDays:
      params.documentVersionRetentionDays === undefined ? undefined : normalizeDays(params.documentVersionRetentionDays),
    legalHoldEnabled:
      params.legalHoldEnabled === undefined ? undefined : Boolean(params.legalHoldEnabled)
  };

  const updated = await prisma.retentionPolicy.upsert({
    where: { organizationId: params.organizationId },
    create: {
      organizationId: params.organizationId,
      auditEventRetentionDays: data.auditEventRetentionDays ?? defaultRetention().auditEventRetentionDays,
      documentVersionRetentionDays: data.documentVersionRetentionDays ?? defaultRetention().documentVersionRetentionDays,
      legalHoldEnabled: data.legalHoldEnabled ?? true
    },
    update: {
      ...(data.auditEventRetentionDays !== undefined ? { auditEventRetentionDays: data.auditEventRetentionDays } : {}),
      ...(data.documentVersionRetentionDays !== undefined
        ? { documentVersionRetentionDays: data.documentVersionRetentionDays }
        : {}),
      ...(data.legalHoldEnabled !== undefined ? { legalHoldEnabled: data.legalHoldEnabled } : {})
    }
  });

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "retention.config.update",
    entityType: "RetentionPolicy",
    entityId: updated.id,
    details: {
      auditEventRetentionDays: updated.auditEventRetentionDays,
      documentVersionRetentionDays: updated.documentVersionRetentionDays,
      legalHoldEnabled: updated.legalHoldEnabled
    },
    request: params.request
  });

  return {
    auditEventRetentionDays: updated.auditEventRetentionDays,
    documentVersionRetentionDays: updated.documentVersionRetentionDays,
    legalHoldEnabled: updated.legalHoldEnabled
  };
};

export const listLegalHolds = async (organizationId: string) => {
  return await prisma.legalHold.findMany({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: "desc" }
  });
};

export const createLegalHold = async (params: {
  organizationId: string;
  actorUserId: string;
  recordType: string;
  recordId: string;
  recordVersionId?: string | null;
  reason?: string | null;
  request: Request;
}) => {
  const created = await prisma.legalHold.create({
    data: {
      organizationId: params.organizationId,
      createdByUserId: params.actorUserId,
      recordType: params.recordType.trim().toUpperCase(),
      recordId: params.recordId.trim(),
      recordVersionId: params.recordVersionId?.trim() || null,
      reason: params.reason?.trim() || null
    }
  });
  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "retention.legal_hold.create",
    entityType: "LegalHold",
    entityId: created.id,
    details: {
      recordType: created.recordType,
      recordId: created.recordId,
      recordVersionId: created.recordVersionId
    },
    request: params.request
  });
  return created;
};

export const releaseLegalHold = async (params: {
  organizationId: string;
  actorUserId: string;
  holdId: string;
  reason?: string | null;
  request: Request;
}) => {
  const updated = await prisma.legalHold.updateMany({
    where: {
      id: params.holdId,
      organizationId: params.organizationId,
      isActive: true
    },
    data: {
      isActive: false,
      releasedAt: new Date(),
      releasedByUserId: params.actorUserId,
      reason: params.reason?.trim() || undefined
    }
  });
  if (updated.count === 0) {
    throw new Error("Legal hold not found or already released.");
  }
  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "retention.legal_hold.release",
    entityType: "LegalHold",
    entityId: params.holdId,
    details: { reason: params.reason?.trim() || null },
    request: params.request
  });
  return await prisma.legalHold.findUniqueOrThrow({ where: { id: params.holdId } });
};

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
};

export const runRetentionPurge = async (params: {
  organizationId: string;
  actorUserId: string;
  dryRun: boolean;
  request: Request;
}) => {
  const now = new Date();
  const policy = await getRetentionConfiguration(params.organizationId);
  const [generatedDocuments, documentVersions, auditEvents, legalHolds] = await Promise.all([
    prisma.generatedDocument.findMany({
      where: { organizationId: params.organizationId },
      select: { id: true, createdAt: true, deletedAt: true }
    }),
    prisma.documentVersion.findMany({
      where: { generatedDocument: { organizationId: params.organizationId } },
      select: { id: true, generatedDocumentId: true, createdAt: true, deletedAt: true }
    }),
    prisma.auditEvent.findMany({
      where: { organizationId: params.organizationId },
      select: { id: true, timestamp: true }
    }),
    prisma.legalHold.findMany({
      where: { organizationId: params.organizationId, isActive: true },
      select: { recordType: true, recordId: true, recordVersionId: true, isActive: true }
    })
  ]);

  const plan = buildRetentionPurgePlan({
    now,
    policy,
    generatedDocuments,
    documentVersions,
    auditEvents,
    legalHolds
  });

  if (!params.dryRun) {
    if (plan.generatedDocuments.toDeleteIds.length > 0) {
      await prisma.generatedDocument.updateMany({
        where: { id: { in: plan.generatedDocuments.toDeleteIds }, organizationId: params.organizationId },
        data: { deletedAt: now }
      });
    }
    if (plan.documentVersions.toDeleteIds.length > 0) {
      await prisma.documentVersion.updateMany({
        where: { id: { in: plan.documentVersions.toDeleteIds }, generatedDocument: { organizationId: params.organizationId } },
        data: { deletedAt: now }
      });
    }
  }

  const report = {
    generatedAtUtc: now.toISOString(),
    actorUserId: params.actorUserId,
    dryRun: params.dryRun,
    policy,
    wouldDelete: {
      generatedDocuments: plan.generatedDocuments.toDeleteIds,
      documentVersions: plan.documentVersions.toDeleteIds,
      auditEvents: plan.auditEvents.toDeleteIds
    },
    blocked: {
      generatedDocuments: plan.generatedDocuments.blockedByHoldIds,
      documentVersions: plan.documentVersions.blockedByHoldIds,
      auditEvents: plan.auditEvents.blockedByHoldIds,
      auditBlockedReason: plan.auditEvents.blockedReason
    },
    deleted: {
      generatedDocuments: params.dryRun ? [] : plan.generatedDocuments.toDeleteIds,
      documentVersions: params.dryRun ? [] : plan.documentVersions.toDeleteIds,
      auditEvents: []
    }
  };

  const reportJson = JSON.stringify(report, null, 2);
  const reportHash = createHash("sha256").update(reportJson).digest("hex");
  const signature = createHmac("sha256", getRequiredEnv().JWT_SECRET).update(canonicalize(report)).digest("hex");

  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `retention-purge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  await fs.writeFile(reportPath, reportJson, "utf8");

  const persisted = await prisma.retentionPurgeRun.create({
    data: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      dryRun: params.dryRun,
      reportJson,
      reportHash,
      signature,
      reportPath
    }
  });

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: params.dryRun ? "retention.purge.dry_run" : "retention.purge.apply",
    entityType: "RetentionPurgeRun",
    entityId: persisted.id,
    details: {
      reportHash,
      deletedDocuments: report.deleted.generatedDocuments.length,
      deletedVersions: report.deleted.documentVersions.length,
      blockedByHold:
        report.blocked.generatedDocuments.length +
        report.blocked.documentVersions.length +
        report.blocked.auditEvents.length
    },
    request: params.request
  });

  return {
    runId: persisted.id,
    dryRun: params.dryRun,
    reportHash,
    reportPath,
    summary: {
      deletedDocuments: report.deleted.generatedDocuments.length,
      deletedVersions: report.deleted.documentVersions.length,
      deletedAuditEvents: report.deleted.auditEvents.length
    }
  };
};

export const getRetentionPurgeRunForDownload = async (params: {
  organizationId: string;
  runId: string;
  actorUserId: string;
  request: Request;
}) => {
  const run = await prisma.retentionPurgeRun.findFirstOrThrow({
    where: { id: params.runId, organizationId: params.organizationId }
  });
  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "retention.purge.download",
    entityType: "RetentionPurgeRun",
    entityId: run.id,
    details: { reportHash: run.reportHash },
    request: params.request
  });
  return run;
};

