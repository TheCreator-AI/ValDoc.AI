import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";
import { fileToResponse } from "@/server/export/packageExporter";
import { exportEvidencePackage } from "@/server/evidence/exporter";

const parseDateRange = (request: Request) => {
  const url = new URL(request.url);
  const fromRaw = url.searchParams.get("date_from");
  const toRaw = url.searchParams.get("date_to");
  if (!fromRaw || !toRaw) {
    throw new ApiError(400, "date_from and date_to are required.");
  }

  const from = new Date(`${fromRaw}T00:00:00.000Z`);
  const to = new Date(`${toRaw}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ApiError(400, "Invalid date range.");
  }
  if (to.getTime() < from.getTime()) {
    throw new ApiError(400, "date_to must be greater than or equal to date_from.");
  }
  return { from, to };
};

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const { from, to } = parseDateRange(request);
    const exported = await exportEvidencePackage({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      dateFrom: from,
      dateTo: to
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "evidence.export",
      entityType: "EvidencePackage",
      entityId: "system",
      outcome: "SUCCESS",
      details: {
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
        artifactCount: Object.keys(exported.manifest.artifacts).length
      },
      request
    });

    return await fileToResponse(exported.filePath, "application/zip", `valdoc-evidence-${fromRaw(from)}-${fromRaw(to)}`);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to export evidence package." });
  }
}

const fromRaw = (date: Date) => date.toISOString().slice(0, 10);
