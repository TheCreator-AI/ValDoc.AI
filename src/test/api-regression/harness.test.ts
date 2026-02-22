/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeRegressionHarness,
  createSessionCookieForFixture,
  ensureRegressionFixtures,
  getRegressionPrisma,
  regressionFixtures,
  signInAsFixture
} from "@/test/api-regression/harness";

describe("security regression harness", () => {
  const prisma = getRegressionPrisma();

  beforeAll(async () => {
    await ensureRegressionFixtures();
  });

  afterAll(async () => {
    await closeRegressionHarness();
  });

  it("creates two organizations and six role fixtures", async () => {
    const orgs = await prisma.organization.findMany({
      where: { id: { in: ["org_a", "org_b"] } },
      select: { id: true, isActive: true }
    });
    expect(orgs).toHaveLength(2);
    expect(orgs.every((org) => org.isActive)).toBe(true);

    const users = await prisma.user.findMany({
      where: {
        email: {
          in: Object.values(regressionFixtures).map((fixture) => fixture.email)
        }
      },
      select: { email: true, role: true, organizationId: true }
    });
    expect(users).toHaveLength(6);
  });

  it("creates valid org-scoped session tokens for org A and org B fixtures", async () => {
    const orgA = await signInAsFixture("orgAAdmin");
    const orgB = await signInAsFixture("orgBReviewer");

    expect(orgA.cookie).toContain("valdoc_token=");
    expect(orgA.decoded.organizationId).toBe("org_a");
    expect(orgA.decoded.role).toBe("ADMIN");

    expect(orgB.cookie).toContain("valdoc_token=");
    expect(orgB.decoded.organizationId).toBe("org_b");
    expect(orgB.decoded.role).toBe("REVIEWER");
  });

  it("creates an app-style session cookie helper for route simulation", async () => {
    const cookieHeader = await createSessionCookieForFixture("orgAAuthor");
    expect(cookieHeader).toContain("valdoc_token=");
    expect(cookieHeader).toContain("HttpOnly");
  });
});
