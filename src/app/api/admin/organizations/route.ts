import { prisma } from "@/server/db/prisma";
import { getPasswordPolicyErrors, hashPassword } from "@/server/auth/password";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";
import { assertSystemOwnerOrThrow } from "@/server/auth/systemOwner";
import { writeAuditEvent } from "@/server/audit/events";

export async function GET() {
  try {
    const session = await getSessionOrThrow("ADMIN");
    assertSystemOwnerOrThrow(session.email);

    const organizations = await prisma.organization.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { users: true } }
      }
    });

    return apiJson(200, organizations);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to list organizations." });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionOrThrow("ADMIN");
    assertSystemOwnerOrThrow(session.email);
    const body = (await request.json()) as {
      name?: string;
      adminEmail?: string;
      adminFullName?: string;
      adminPassword?: string;
    };

    const name = body.name?.trim();
    const adminEmail = body.adminEmail?.trim().toLowerCase();
    const adminFullName = body.adminFullName?.trim();
    const adminPassword = body.adminPassword?.trim();

    if (!name || !adminEmail || !adminFullName || !adminPassword) {
      return apiJson(400, { error: "Organization name and initial admin credentials are required." });
    }
    const passwordPolicyErrors = getPasswordPolicyErrors(adminPassword);
    if (passwordPolicyErrors.length > 0) {
      return apiJson(400, { error: passwordPolicyErrors[0], issues: passwordPolicyErrors });
    }

    const passwordHash = await hashPassword(adminPassword);
    const created = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name,
          isActive: true
        },
        select: { id: true, name: true, isActive: true }
      });

      const admin = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: adminEmail,
          fullName: adminFullName,
          passwordHash,
          role: "ADMIN"
        },
        select: { id: true, email: true, fullName: true, role: true }
      });

      return { organization, admin };
    });

    await writeAuditEvent({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "organization.create",
      entityType: "Organization",
      entityId: created.organization.id,
      details: { name: created.organization.name, adminEmail: created.admin.email },
      request
    });

    return apiJson(201, created);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return apiJson(409, { error: "Organization/admin email already exists." });
    }
    return apiJson(500, { error: "Failed to create organization." });
  }
}

