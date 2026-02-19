import { Role } from "@prisma/client";

export type ProvisionInput = {
  customerId: string;
  orgName: string;
  adminEmail: string;
  adminFullName: string;
  adminPasswordHash: string;
};

type ProvisionPrisma = {
  organization: {
    findMany: (args: { select: { id: true } }) => Promise<Array<{ id: string }>>;
    upsert: (args: {
      where: { id: string };
      create: { id: string; name: string; isActive: boolean };
      update: { name: string; isActive: boolean };
    }) => Promise<unknown>;
    updateMany: (args: { where: { id: { not: string } }; data: { isActive: boolean } }) => Promise<unknown>;
  };
  deploymentConfig: {
    upsert: (args: {
      where: { id: string };
      create: { id: string; customerId: string; orgName: string };
      update: { customerId: string; orgName: string };
    }) => Promise<unknown>;
  };
  deploymentRole: {
    upsert: (args: {
      where: { name: Role };
      create: { name: Role; description: string };
      update: { description: string };
    }) => Promise<unknown>;
  };
  user: {
    findUnique: (args: { where: { email: string }; select: { id: true } }) => Promise<{ id: string } | null>;
    create: (args: {
      data: {
        organizationId: string;
        email: string;
        fullName: string;
        passwordHash: string;
        role: Role;
      };
    }) => Promise<unknown>;
  };
};

const defaultRoles: Array<{ name: Role; description: string }> = [
  { name: "ADMIN" as Role, description: "Full administrative access to instance configuration and records." },
  { name: "USER" as Role, description: "Can create and update draft templates, equipment records, and generated documents." },
  { name: "APPROVER" as Role, description: "Can formally approve templates and controlled content." },
  { name: "REVIEWER" as Role, description: "Can review controlled content and provide feedback." },
  { name: "VIEWER" as Role, description: "Read-only access to templates, equipment, and units." },
  { name: "AUTHOR" as Role, description: "Legacy role mapped to USER permissions." },
  { name: "ENGINEER" as Role, description: "Legacy role mapped to USER permissions." }
];

export const provisionDeployment = async (input: ProvisionInput, prisma: ProvisionPrisma) => {
  const customerId = input.customerId.trim();
  const orgName = input.orgName.trim();
  const adminEmail = input.adminEmail.trim().toLowerCase();
  const adminFullName = input.adminFullName.trim();

  const existingOrgs = await prisma.organization.findMany({
    select: { id: true }
  });
  const hasMismatchedOrg = existingOrgs.some((org) => org.id !== customerId);
  if (hasMismatchedOrg) {
    throw new Error("Provisioning aborted: deployment already contains organization data for a different CUSTOMER_ID.");
  }

  await prisma.organization.upsert({
    where: { id: customerId },
    create: { id: customerId, name: orgName, isActive: true },
    update: { name: orgName, isActive: true }
  });

  await prisma.organization.updateMany({
    where: { id: { not: customerId } },
    data: { isActive: false }
  });

  await prisma.deploymentConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      customerId,
      orgName
    },
    update: {
      customerId,
      orgName
    }
  });

  for (const role of defaultRoles) {
    await prisma.deploymentRole.upsert({
      where: { name: role.name },
      create: role,
      update: { description: role.description }
    });
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true }
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        organizationId: customerId,
        email: adminEmail,
        fullName: adminFullName,
        passwordHash: input.adminPasswordHash,
        role: Role.ADMIN
      }
    });
  }

  return {
    organizationId: customerId,
    organizationName: orgName,
    adminEmail,
    adminCreated: !existingAdmin,
    roles: defaultRoles.map((role) => role.name)
  };
};
