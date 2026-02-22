import { compare, hash } from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, type Role } from "@prisma/client";
import { buildSessionCookieHeader } from "@/server/auth/cookie";
import { getAuthPolicy } from "@/server/auth/policy";
import { signSessionToken, verifySessionToken } from "@/server/auth/token";

const regressionDatabaseUrl = "file:./regression-harness.db";
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: regressionDatabaseUrl
    }
  }
});

export type RegressionUserFixture = {
  organizationId: "org_a" | "org_b";
  role: "ADMIN" | "REVIEWER" | "AUTHOR";
  email: string;
  fullName: string;
  password: string;
};

export const regressionFixtures: Record<
  "orgAAdmin" | "orgAReviewer" | "orgAAuthor" | "orgBAdmin" | "orgBReviewer" | "orgBAuthor",
  RegressionUserFixture
> = {
  orgAAdmin: {
    organizationId: "org_a",
    role: "ADMIN",
    email: "admin.a@test.local",
    fullName: "Org A Admin",
    password: "Password123!"
  },
  orgAReviewer: {
    organizationId: "org_a",
    role: "REVIEWER",
    email: "reviewer.a@test.local",
    fullName: "Org A Reviewer",
    password: "Password123!"
  },
  orgAAuthor: {
    organizationId: "org_a",
    role: "AUTHOR",
    email: "author.a@test.local",
    fullName: "Org A Author",
    password: "Password123!"
  },
  orgBAdmin: {
    organizationId: "org_b",
    role: "ADMIN",
    email: "admin.b@test.local",
    fullName: "Org B Admin",
    password: "Password123!"
  },
  orgBReviewer: {
    organizationId: "org_b",
    role: "REVIEWER",
    email: "reviewer.b@test.local",
    fullName: "Org B Reviewer",
    password: "Password123!"
  },
  orgBAuthor: {
    organizationId: "org_b",
    role: "AUTHOR",
    email: "author.b@test.local",
    fullName: "Org B Author",
    password: "Password123!"
  }
};

const fixtureOrganizations = [
  { id: "org_a", name: "Regression Org A" },
  { id: "org_b", name: "Regression Org B" }
] as const;

const applyMigrations = async () => {
  const migrationPath = path.resolve(process.cwd(), "prisma", "migrations", "0001_init", "migration.sql");
  const migrationSql = await fs.promises.readFile(migrationPath, "utf8");
  const statements = migrationSql
    .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
    .replace(/CREATE UNIQUE INDEX /g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        message.includes("already exists") ||
        message.includes("duplicate column name") ||
        message.includes("unique constraint failed")
      ) {
        continue;
      }
      throw error;
    }
  }

  const hasColumn = async (table: string, column: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
    return rows.some((row) => row.name === column);
  };
  const ensureColumn = async (table: string, column: string, statement: string) => {
    if (!(await hasColumn(table, column))) {
      await prisma.$executeRawUnsafe(statement);
    }
  };

  await ensureColumn("Organization", "isActive", "ALTER TABLE \"Organization\" ADD COLUMN \"isActive\" BOOLEAN NOT NULL DEFAULT true");
  await ensureColumn("User", "userStatus", "ALTER TABLE \"User\" ADD COLUMN \"userStatus\" TEXT NOT NULL DEFAULT 'ACTIVE'");
  await ensureColumn("User", "mfaEnabled", "ALTER TABLE \"User\" ADD COLUMN \"mfaEnabled\" BOOLEAN NOT NULL DEFAULT false");
  await ensureColumn("User", "failedLoginAttempts", "ALTER TABLE \"User\" ADD COLUMN \"failedLoginAttempts\" INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("User", "lockedAt", "ALTER TABLE \"User\" ADD COLUMN \"lockedAt\" DATETIME");
  await ensureColumn("User", "passwordUpdatedAt", "ALTER TABLE \"User\" ADD COLUMN \"passwordUpdatedAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("UserSession", "lastActivityAt", "ALTER TABLE \"UserSession\" ADD COLUMN \"lastActivityAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("UserSession", "idleTimeoutSeconds", "ALTER TABLE \"UserSession\" ADD COLUMN \"idleTimeoutSeconds\" INTEGER NOT NULL DEFAULT 1800");
  await ensureColumn("UserSession", "revokedAt", "ALTER TABLE \"UserSession\" ADD COLUMN \"revokedAt\" DATETIME");
  await ensureColumn("UserSession", "ip", "ALTER TABLE \"UserSession\" ADD COLUMN \"ip\" TEXT");
  await ensureColumn("UserSession", "userAgent", "ALTER TABLE \"UserSession\" ADD COLUMN \"userAgent\" TEXT");
};

export const ensureRegressionFixtures = async () => {
  await applyMigrations();

  for (const org of fixtureOrganizations) {
    await prisma.organization.upsert({
      where: { id: org.id },
      update: { name: org.name, isActive: true },
      create: { id: org.id, name: org.name, isActive: true }
    });
  }

  for (const fixture of Object.values(regressionFixtures)) {
    const passwordHash = await hash(fixture.password, 10);
    await prisma.user.upsert({
      where: { email: fixture.email },
      update: {
        organizationId: fixture.organizationId,
        fullName: fixture.fullName,
        role: fixture.role as Role,
        passwordHash,
        passwordUpdatedAt: new Date()
      },
      create: {
        organizationId: fixture.organizationId,
        email: fixture.email,
        fullName: fixture.fullName,
        role: fixture.role as Role,
        passwordHash
      }
    });
  }
};

export const signInAsFixture = async (fixtureKey: keyof typeof regressionFixtures) => {
  const fixture = regressionFixtures[fixtureKey];
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: fixture.email },
    select: {
      id: true,
      email: true,
      organizationId: true,
      role: true,
      passwordHash: true
    }
  });
  const isPasswordValid = await compare(fixture.password, user.passwordHash);
  if (!isPasswordValid) {
    throw new Error("Fixture password verification failed.");
  }
  const policy = getAuthPolicy();
  const session = await prisma.userSession.create({
    data: {
      organizationId: fixture.organizationId,
      userId: user.id,
      expiresAt: new Date(Date.now() + policy.sessionMaxAgeSeconds * 1000),
      lastActivityAt: new Date(),
      idleTimeoutSeconds: policy.idleTimeoutSeconds
    },
    select: { id: true }
  });
  const token = await signSessionToken({
    userId: user.id,
    organizationId: fixture.organizationId,
    role: user.role,
    email: user.email,
    sessionId: session.id
  });
  const cookie = buildSessionCookieHeader({
    token,
    maxAgeSeconds: policy.sessionMaxAgeSeconds
  });
  const decoded = await verifySessionToken(token);
  return { fixture, cookie, token, decoded };
};

export const createSessionCookieForFixture = async (fixtureKey: keyof typeof regressionFixtures) => {
  const { cookie } = await signInAsFixture(fixtureKey);
  return cookie;
};

export const getRegressionPrisma = () => prisma;

export const closeRegressionHarness = async () => {
  await prisma.$disconnect();
};
