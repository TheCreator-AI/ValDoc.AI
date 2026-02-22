import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/server/db/prisma";
import { getRequiredEnv } from "@/server/config/env";
import { runScheduledAuditChainVerification } from "@/server/audit/scheduler";

const env = getRequiredEnv();
const lookbackArg = process.argv.find((arg) => arg.startsWith("--lookback-days="));
const lookbackDays = lookbackArg ? Number.parseInt(lookbackArg.split("=")[1] ?? "1", 10) : 1;
const lookback = Number.isFinite(lookbackDays) && lookbackDays > 0 ? lookbackDays : 1;

const resolveOrganization = async () => {
  const exact = await prisma.organization.findFirst({
    where: { id: env.CUSTOMER_ID, isActive: true },
    select: { id: true, name: true }
  });
  if (exact) return exact;
  return await prisma.organization.findFirst({
    where: { name: env.ORG_NAME, isActive: true },
    select: { id: true, name: true }
  });
};

const resolveActorUser = async (organizationId: string) => {
  const systemOwnerEmail = process.env.SYSTEM_OWNER_EMAIL?.trim();
  if (systemOwnerEmail) {
    const byEmail = await prisma.user.findFirst({
      where: { organizationId, email: systemOwnerEmail },
      select: { id: true, email: true }
    });
    if (byEmail) return byEmail;
  }
  return await prisma.user.findFirst({
    where: { organizationId, role: "ADMIN" },
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" }
  });
};

const run = async () => {
  const organization = await resolveOrganization();
  if (!organization) {
    throw new Error(`Active organization not found for CUSTOMER_ID=${env.CUSTOMER_ID} OR ORG_NAME=${env.ORG_NAME}.`);
  }
  const actor = await resolveActorUser(organization.id);
  if (!actor) {
    throw new Error("No admin user found to attribute scheduled audit-chain verification.");
  }

  const result = await runScheduledAuditChainVerification({
    organizationId: organization.id,
    actorUserId: actor.id,
    lookbackDays: lookback
  });

  const logsDir = path.resolve(process.cwd(), "storage", "logs");
  await fs.promises.mkdir(logsDir, { recursive: true });
  const summary = {
    timestampUtc: new Date().toISOString(),
    organizationId: organization.id,
    organizationName: organization.name,
    actorUserId: actor.id,
    actorEmail: actor.email,
    lookbackDays: lookback,
    reportId: result.reportId,
    reportHash: result.reportHash,
    pass: result.pass,
    checkedEvents: result.checkedEvents,
    reportPath: result.reportPath
  };
  const logPath = path.join(logsDir, `audit-chain-scheduled-${Date.now()}.json`);
  await fs.promises.writeFile(logPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`[audit-chain-scheduled] generated report ${result.reportId} (pass=${result.pass})`);
  console.log(`[audit-chain-scheduled] summary log: ${logPath}`);
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`[audit-chain-scheduled] failed: ${message}`);
  process.exit(1);
});
