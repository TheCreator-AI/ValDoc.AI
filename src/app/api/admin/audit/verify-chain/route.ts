import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";
import { verifyAuditChain } from "@/server/audit/chain";
import { generateTamperEvidenceReport } from "@/server/audit/verificationReport";

export async function GET(request: Request) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "audit.read");
    const events = await prisma.auditEvent.findMany({
      where: { organizationId: session.organizationId },
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
    });

    const result = verifyAuditChain(
      events.map((event) => ({
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

    const chainHead = await prisma.auditChainHead.findUnique({
      where: { organizationId: session.organizationId },
      select: { headHash: true }
    });

    const computedHead = result.ok ? (result.headHash ?? "") : null;
    const storedHead = chainHead?.headHash ?? "";
    if (result.ok && computedHead !== storedHead) {
      return apiJson(200, {
        pass: false,
        firstBrokenEventId: null,
        reason: "chain_head_mismatch",
        checkedEvents: events.length
      });
    }

    return apiJson(200, {
      pass: result.ok,
      firstBrokenEventId: result.ok ? null : result.brokenEventId,
      reason: result.reason,
      checkedEvents: events.length
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to verify audit chain." });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "audit.read");
    const body = (await request.json().catch(() => ({}))) as { dateFrom?: string; dateTo?: string };
    const generated = await generateTamperEvidenceReport({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      request
    });
    return apiJson(201, generated);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to generate tamper-evidence report." });
  }
}
