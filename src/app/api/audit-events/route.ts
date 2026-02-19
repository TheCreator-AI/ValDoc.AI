import { prisma } from "@/server/db/prisma";
import { AuditOutcome, Prisma } from "@prisma/client";
import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";

const toCsv = (rows: Array<Record<string, string>>) => {
  if (rows.length === 0) return "timestamp,action,entity_type,entity_id,outcome,actor_email,ip,user_agent,metadata_json\n";
  const headers = Object.keys(rows[0]);
  const escape = (value: string) => `"${value.replaceAll("\"", "\"\"")}"`;
  const body = rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(",")).join("\n");
  return `${headers.join(",")}\n${body}\n`;
};

const parseDate = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export async function GET(request: Request) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "audit.read");
    const url = new URL(request.url);
    const action = url.searchParams.get("action")?.trim() ?? "";
    const entityType = url.searchParams.get("entityType")?.trim() ?? "";
    const actorUserId = url.searchParams.get("actorUserId")?.trim() ?? "";
    const outcome = url.searchParams.get("outcome")?.trim().toUpperCase() ?? "";
    const dateFrom = url.searchParams.get("dateFrom")?.trim() ?? "";
    const dateTo = url.searchParams.get("dateTo")?.trim() ?? "";
    const format = url.searchParams.get("format")?.trim() ?? "json";
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(1000, limit)) : 200;
    const fromDate = parseDate(dateFrom);
    const toDate = parseDate(dateTo);

    if (dateFrom && !fromDate) {
      return apiJson(400, { error: "dateFrom must be a valid date." });
    }
    if (dateTo && !toDate) {
      return apiJson(400, { error: "dateTo must be a valid date." });
    }

    const parsedOutcome: AuditOutcome | null =
      outcome === "SUCCESS" || outcome === "DENIED" ? (outcome as AuditOutcome) : null;

    const where: Prisma.AuditEventWhereInput = {
      organizationId: session.organizationId,
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(actorUserId ? { actorUserId } : {}),
      ...(parsedOutcome ? { outcome: parsedOutcome } : {}),
      ...((fromDate || toDate)
        ? {
            timestamp: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {})
            }
          }
        : {})
    };

    const events = await prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: safeLimit,
      include: { actor: { select: { email: true, fullName: true, role: true } } }
    });

    if (format === "csv") {
      const csv = toCsv(
        events.map((event) => ({
          timestamp: event.timestamp.toISOString(),
          action: event.action,
          entity_type: event.entityType,
          entity_id: event.entityId,
          outcome: event.outcome,
          actor_email: event.actor?.email ?? "",
          ip: event.ip ?? "",
          user_agent: event.userAgent ?? "",
          metadata_json: event.metadataJson ?? event.detailsJson ?? ""
        }))
      );
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit-events-${new Date().toISOString().slice(0, 10)}.csv"`
        }
      });
    }

    return apiJson(200, events);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to list audit events." });
  }
}
