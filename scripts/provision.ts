import { execSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { prisma } from "../src/server/db/prisma";
import { getRequiredEnv } from "../src/server/config/env";
import { provisionDeployment } from "../src/server/setup/provision";

const getArg = (name: string) => {
  const args = process.argv.slice(2);
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return "";
  return args[index + 1] ?? "";
};

const requireArg = (name: string) => {
  const value = getArg(name).trim();
  if (!value) {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
};

const main = async () => {
  const env = getRequiredEnv();
  const adminEmail = requireArg("admin-email");
  const adminName = requireArg("admin-name");
  const adminPassword = requireArg("admin-password");

  console.log("[provision] Running migrations...");
  execSync("npx prisma migrate deploy --schema prisma/schema.prisma", {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const result = await provisionDeployment(
    {
      customerId: env.CUSTOMER_ID,
      orgName: env.ORG_NAME,
      adminEmail,
      adminFullName: adminName,
      adminPasswordHash: passwordHash
    },
    prisma
  );

  console.log(`[provision] Organization configured: ${result.organizationName} (${result.organizationId})`);
  console.log(`[provision] Default roles ensured: ${result.roles.join(", ")}`);
  console.log(`[provision] Admin ${result.adminCreated ? "created" : "already existed"}: ${result.adminEmail}`);
  console.log("[provision] Migration status:");
  execSync("npx prisma migrate status --schema prisma/schema.prisma", {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
};

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[provision] Failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
