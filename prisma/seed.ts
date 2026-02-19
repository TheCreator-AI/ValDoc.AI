import { hash } from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, Role, DocType, SourceType } from "@prisma/client";

process.env.DATABASE_URL = "file:./dev.db";

const prisma = new PrismaClient();

const ensureTables = async () => {
  const migrationPath = path.resolve(process.cwd(), "prisma", "migrations", "0001_init", "migration.sql");
  const sql = await fs.promises.readFile(migrationPath, "utf8");
  const statements = sql
    .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
    .replace(/CREATE UNIQUE INDEX /g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
};

async function main() {
  await ensureTables();
  const orgA = await prisma.organization.upsert({
    where: { id: "org_qa" },
    update: { isActive: true },
    create: { id: "org_qa", name: "Quality Agents", isActive: true }
  });

  const passwordHash = await hash("Password123!", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "andrew@qa.org" },
    update: {},
    create: {
      organizationId: orgA.id,
      email: "andrew@qa.org",
      passwordHash,
      fullName: "Andrew Herman",
      role: Role.ADMIN
    }
  });

  const machine = await prisma.machine.upsert({
    where: { id: "machine_bioreactor_01" },
    update: {},
    create: {
      id: "machine_bioreactor_01",
      organizationId: orgA.id,
      name: "Bioreactor System 01",
      modelNumber: "BRX-500",
      manufacturer: "BioSystems Inc"
    }
  });

  for (const docType of [
    DocType.URS,
    DocType.SIA,
    DocType.RID,
    DocType.DIA,
    DocType.IOQ,
    DocType.OQ,
    DocType.PROTOCOL_SUMMARY,
    DocType.SUMMARY,
    DocType.EXECUTED_PROTOCOL,
    DocType.TRACEABILITY
  ]) {
    await prisma.documentTemplate.upsert({
      where: { id: `template_${orgA.id}_${docType}_primary` },
      update: {
        templateId: `seed_${orgA.id}_${docType}`,
        version: 1,
        status: "APPROVED",
        effectiveDate: new Date(),
        createdByUserId: adminUser.id,
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
        title: `${docType} Template`,
        contentTemplate: `# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Facts\n{{FACTS}}\n\n## Citations\n{{CITATIONS}}`,
        templateKind: "PRIMARY",
        isPrimary: true
      },
      create: {
        id: `template_${orgA.id}_${docType}_primary`,
        organizationId: orgA.id,
        templateId: `seed_${orgA.id}_${docType}`,
        version: 1,
        status: "APPROVED",
        effectiveDate: new Date(),
        createdByUserId: adminUser.id,
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
        docType,
        title: `${docType} Template`,
        contentTemplate: `# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Facts\n{{FACTS}}\n\n## Citations\n{{CITATIONS}}`,
        templateKind: "PRIMARY",
        isPrimary: true
      }
    });
  }

  await prisma.sourceDocument.create({
    data: {
      organizationId: orgA.id,
      machineId: machine.id,
      fileName: "sample-manual.txt",
      filePath: "samples/sources/sample-manual.txt",
      mimeType: "text/plain",
      sourceType: SourceType.MANUAL,
      extractedText: "Bioreactor intended use is sterile cell culture. Temperature range 2-8 C."
    }
  });

  const upstreamLab = await prisma.labGroup.upsert({
    where: { organizationId_name: { organizationId: orgA.id, name: "Upstream Lab - Suite A" } },
    update: {},
    create: {
      organizationId: orgA.id,
      name: "Upstream Lab - Suite A",
      description: "Primary suite for cell culture development."
    }
  });

  const downstreamLab = await prisma.labGroup.upsert({
    where: { organizationId_name: { organizationId: orgA.id, name: "Downstream Lab - Suite B" } },
    update: {},
    create: {
      organizationId: orgA.id,
      name: "Downstream Lab - Suite B",
      description: "Purification and fill-finish support area."
    }
  });

  await prisma.changeControl.create({
    data: {
      organizationId: orgA.id,
      machineId: machine.id,
      requestedByUserId: (await prisma.user.findUniqueOrThrow({ where: { email: "andrew@qa.org" } })).id,
      title: "TSX2320FA20 firmware update to v2.4",
      description: "Apply approved firmware patch to improve alarm handling logic.",
      changeType: "SOFTWARE_UPDATE",
      status: "IN_ASSESSMENT",
      riskAssessment: "Potential impact on temperature alarm timing and audit trail records.",
      systemImpactSummary: "Upstream suite impacted. Downstream suite not impacted.",
      requiresRevalidation: true,
      revalidationPlan: "Targeted IOQ alarm verification and data logging challenge test.",
      trainingPlan: "Train operators on revised alarm acknowledgment flow.",
      impacts: {
        create: [
          { labGroupId: upstreamLab.id, impactLevel: "HIGH", impactSummary: "Directly connected equipment." },
          { labGroupId: downstreamLab.id, impactLevel: "LOW", impactSummary: "No direct connection." }
        ]
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
