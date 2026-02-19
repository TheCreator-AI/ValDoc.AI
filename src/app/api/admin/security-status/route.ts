import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrowWithPermission } from "@/server/api/http";
import { getAuthPolicy } from "@/server/auth/policy";
import { isTwoPersonRuleEnforced } from "@/server/compliance/segregationOfDuties";
import { getAuditSinkConfig } from "@/server/audit/sink";

const sanitizeSinkUrlHost = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
};

export async function GET(request: Request) {
  try {
    const session = await getSessionOrThrowWithPermission(request, "organizations.manage");
    const authPolicy = getAuthPolicy();
    const sinkConfig = getAuditSinkConfig();
    const [organization, chainHead] = await Promise.all([
      prisma.organization.findFirst({
        where: { id: session.organizationId },
        select: { name: true }
      }),
      prisma.auditChainHead.findUnique({
        where: { organizationId: session.organizationId },
        select: { headHash: true }
      })
    ]);

    return apiJson(200, {
      serverTimeUtc: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV ?? "development",
      appTimezone: (process.env.APP_TIMEZONE ?? "UTC").trim() || "UTC",
      organizationName: organization?.name ?? "Unknown Organization",
      controls: {
        csrf: { enabled: true },
        securityHeaders: { enabled: true },
        rateLimiting: { enabled: true },
        privilegedMfa: { required: authPolicy.requirePrivilegedMfa },
        twoPersonRule: { enforced: isTwoPersonRuleEnforced() },
        auditChain: { headPresent: Boolean(chainHead?.headHash) },
        auditSink: {
          enabled: sinkConfig.enabled,
          required: sinkConfig.required,
          targetHost: sanitizeSinkUrlHost(sinkConfig.url)
        }
      }
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to load security status." });
  }
}
