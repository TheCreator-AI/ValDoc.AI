import { generateTamperEvidenceReport } from "@/server/audit/verificationReport";

export const runScheduledAuditChainVerification = async (params: {
  organizationId: string;
  actorUserId: string;
  lookbackDays?: number;
}) => {
  const lookbackDays = params.lookbackDays ?? 1;
  const now = new Date();
  const dateFrom = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  return await generateTamperEvidenceReport({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    dateFrom: dateFrom.toISOString(),
    dateTo: now.toISOString()
  });
};
