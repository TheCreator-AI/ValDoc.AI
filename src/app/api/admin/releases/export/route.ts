import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { fileToResponse } from "@/server/export/packageExporter";
import { writeAuditEvent } from "@/server/audit/events";
import { listReleaseEntries } from "@/server/releases/service";

const toCsv = (value: string | null | undefined) => {
  const normalized = (value ?? "").replaceAll("\"", "\"\"");
  return `"${normalized}"`;
};

export async function GET(request: Request) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const releases = await listReleaseEntries(session.organizationId);
    const header = [
      "build_version",
      "release_date",
      "change_summary",
      "risk_impact",
      "build_hash",
      "sbom_hash",
      "test_results_summary_hash",
      "production_deploy_requested",
      "approved_signature_id",
      "approved_by",
      "deployed_at"
    ].join(",");
    const lines = releases.map((release) =>
      [
        toCsv(release.buildVersion),
        toCsv(release.releaseDate.toISOString()),
        toCsv(release.changeSummary),
        toCsv(release.riskImpact),
        toCsv(release.buildHash),
        toCsv(release.sbomHash),
        toCsv(release.testResultsSummaryHash),
        toCsv(String(release.productionDeployRequested)),
        toCsv(release.approvedSignatureId),
        toCsv(release.approvedSignature?.signerFullName ?? null),
        toCsv(release.deployedAt?.toISOString() ?? null)
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");

    const outputDir = path.resolve(process.cwd(), "storage", "exports");
    await fs.mkdir(outputDir, { recursive: true });
    const filePath = path.join(outputDir, `release-history-${randomUUID()}.csv`);
    await fs.writeFile(filePath, csv, "utf8");

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "release.export",
      entityType: "AppRelease",
      entityId: "history",
      details: {
        count: releases.length
      },
      request
    });

    return await fileToResponse(filePath, "text/csv", "release-history");
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to export release history." });
  }
}
