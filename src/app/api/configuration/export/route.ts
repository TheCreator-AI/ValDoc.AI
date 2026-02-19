import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { getRetentionConfiguration } from "@/server/retention/service";

const toPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export async function GET() {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const organization = await prisma.organization.findFirst({
      where: { id: session.organizationId },
      select: { id: true, name: true }
    });
    if (!organization) {
      return apiJson(404, { error: "Organization not found." });
    }
    const retentionConfig = await getRetentionConfiguration(session.organizationId);

    return apiJson(200, {
      organization,
      retention: {
        exportsDays: toPositiveInteger(process.env.EXPORT_RETENTION_DAYS, 365),
        sourceDocumentsDays: toPositiveInteger(process.env.SOURCE_RETENTION_DAYS, 365),
        generatedDocumentsDays:
          retentionConfig.documentVersionRetentionDays ?? toPositiveInteger(process.env.DOCUMENT_RETENTION_DAYS, 365),
        auditRetentionDays: retentionConfig.auditEventRetentionDays ?? toPositiveInteger(process.env.AUDIT_RETENTION_DAYS, 2555),
        legalHoldEnabled: retentionConfig.legalHoldEnabled
      },
      backup: {
        retentionDays: toPositiveInteger(process.env.BACKUP_RETENTION_DAYS, 30),
        frequency: (process.env.BACKUP_FREQUENCY ?? "DAILY_EXTERNAL_SCHEDULER").trim() || "DAILY_EXTERNAL_SCHEDULER",
        schedulingMode: "EXTERNAL_SCHEDULER_REQUIRED"
      }
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to load export configuration." });
  }
}
