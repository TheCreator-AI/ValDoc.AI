import { prisma } from "@/server/db/prisma";
import type { FieldChange } from "@/server/audit/diff";
import { computeEventHash, type AuditChainEventPayload } from "@/server/audit/chain";

const normalizeHeader = (value: string | null) => (value ? value.slice(0, 512) : null);

const resolveClientIp = (request?: Request) => {
  if (!request) return null;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return normalizeHeader(forwardedFor.split(",")[0]?.trim() ?? null);
  }
  return normalizeHeader(request.headers.get("x-real-ip"));
};

export const writeAuditEvent = async (params: {
  organizationId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  fieldChanges?: FieldChange[];
  outcome?: "SUCCESS" | "DENIED";
  request?: Request;
}) => {
  const timestamp = new Date();
  const metadata = params.details ? JSON.stringify(params.details) : null;
  const ip = resolveClientIp(params.request);
  const userAgent = normalizeHeader(params.request?.headers.get("user-agent") ?? null);
  const payload: AuditChainEventPayload = {
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    outcome: params.outcome ?? "SUCCESS",
    metadataJson: metadata,
    detailsJson: metadata,
    ip,
    userAgent,
    timestampIso: timestamp.toISOString()
  };

  const prismaWithTx = prisma as typeof prisma & {
    $transaction?: <T>(fn: (tx: typeof prisma) => Promise<T>) => Promise<T>;
  };

  if (typeof prismaWithTx.$transaction !== "function") {
    const eventHash = computeEventHash("", payload);
    await prisma.auditEvent.create({
      data: {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        outcome: params.outcome ?? "SUCCESS",
        metadataJson: metadata,
        detailsJson: metadata,
        prevHash: "",
        eventHash,
        timestamp,
        changes: params.fieldChanges?.length
          ? {
              create: params.fieldChanges.map((change) => ({
                changePath: change.changePath,
                oldValue: change.oldValue,
                newValue: change.newValue
              }))
            }
          : undefined,
        ip,
        userAgent
      }
    });
    return;
  }

  await prismaWithTx.$transaction(async (tx) => {
    const chainHead = await tx.auditChainHead.findUnique({
      where: { organizationId: params.organizationId }
    });
    const prevHash = chainHead?.headHash ?? "";
    const eventHash = computeEventHash(prevHash, payload);

    const created = await tx.auditEvent.create({
      data: {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        outcome: params.outcome ?? "SUCCESS",
        metadataJson: metadata,
        detailsJson: metadata,
        prevHash,
        eventHash,
        timestamp,
        changes: params.fieldChanges?.length
          ? {
              create: params.fieldChanges.map((change) => ({
                changePath: change.changePath,
                oldValue: change.oldValue,
                newValue: change.newValue
              }))
            }
          : undefined,
        ip,
        userAgent
      }
    });

    await tx.auditChainHead.upsert({
      where: { organizationId: params.organizationId },
      create: {
        organizationId: params.organizationId,
        headHash: eventHash
      },
      update: {
        headHash: eventHash
      }
    });

    return created;
  });
};
