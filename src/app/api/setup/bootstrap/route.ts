import { hash } from "bcryptjs";
import { prisma } from "@/server/db/prisma";
import { apiJson } from "@/server/api/http";
import { writeAuditEvent } from "@/server/audit/events";
import { ensureDatabaseInitialized } from "@/server/db/bootstrap";
import { getRequiredEnv } from "@/server/config/env";
import { provisionDeployment } from "@/server/setup/provision";

export async function POST(request: Request) {
  const env = getRequiredEnv();
  await ensureDatabaseInitialized();
  const count = await prisma.organization.count();
  if (count > 0) {
    return apiJson(409, { error: "Setup is already completed for this deployment." });
  }

  const body = (await request.json()) as {
    organizationName?: string;
    adminEmail?: string;
    adminFullName?: string;
    adminPassword?: string;
  };

  if (!body.organizationName || !body.adminEmail || !body.adminFullName || !body.adminPassword) {
    return apiJson(400, { error: "organizationName, adminEmail, adminFullName, and adminPassword are required." });
  }

  const passwordHash = await hash(body.adminPassword, 10);
  const provisioned = await provisionDeployment(
    {
      customerId: env.CUSTOMER_ID,
      orgName: env.ORG_NAME || body.organizationName.trim(),
      adminEmail: body.adminEmail.trim().toLowerCase(),
      adminFullName: body.adminFullName.trim(),
      adminPasswordHash: passwordHash
    },
    prisma
  );

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: provisioned.organizationId }
  });
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: provisioned.adminEmail }
  });

  await writeAuditEvent({
    organizationId: organization.id,
    actorUserId: admin.id,
    action: "setup.bootstrap.completed",
    entityType: "Organization",
    entityId: provisioned.organizationId,
    details: { organizationName: organization.name, adminEmail: admin.email },
    request
  });

  return apiJson(201, {
    organization: { id: organization.id, name: organization.name },
    admin: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role }
  });
}
