import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { apiJson } from "@/server/api/http";
import { getPasswordPolicyErrors, hashPassword } from "@/server/auth/password";
import { writeAuditEvent } from "@/server/audit/events";

const resetSchema = z.object({
  organizationId: z.string().min(1, "organizationId is required."),
  email: z.string().email("Valid email is required."),
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(1, "New password is required.")
});

export async function POST(request: Request) {
  try {
    const body = resetSchema.parse(await request.json());

    const organization = await prisma.organization.findFirst({
      where: { id: body.organizationId, isActive: true },
      select: { id: true }
    });
    if (!organization) {
      return apiJson(404, { error: "Organization not found." });
    }

    const user = await prisma.user.findFirst({
      where: { email: body.email, organizationId: body.organizationId },
      select: { id: true, email: true, userStatus: true, passwordHash: true }
    });

    if (!user) {
      return apiJson(401, { error: "Invalid credentials." });
    }

    if (user.userStatus === "LOCKED") {
      await writeAuditEvent({
        organizationId: body.organizationId,
        actorUserId: user.id,
        action: "auth.password_reset.failed",
        entityType: "User",
        entityId: user.id,
        outcome: "DENIED",
        details: { reason: "user_locked", email: user.email },
        request
      }).catch(() => undefined);
      return apiJson(423, { error: "Account is locked. Ask an administrator to unlock the account." });
    }

    const currentMatches = await compare(body.currentPassword, user.passwordHash);
    if (!currentMatches) {
      await writeAuditEvent({
        organizationId: body.organizationId,
        actorUserId: user.id,
        action: "auth.password_reset.failed",
        entityType: "User",
        entityId: user.id,
        outcome: "DENIED",
        details: { reason: "invalid_current_password", email: user.email },
        request
      }).catch(() => undefined);
      return apiJson(401, { error: "Current password is incorrect." });
    }

    const errors = getPasswordPolicyErrors(body.newPassword);
    if (errors.length > 0) {
      return apiJson(400, { error: errors[0], issues: errors });
    }

    const passwordHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedLoginAttempts: 0
      }
    });

    await writeAuditEvent({
      organizationId: body.organizationId,
      actorUserId: user.id,
      action: "auth.password_reset.success",
      entityType: "User",
      entityId: user.id,
      details: { email: user.email },
      request
    }).catch(() => undefined);

    return apiJson(200, { ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(400, { error: error.issues[0]?.message ?? "Invalid payload." });
    }
    return apiJson(500, { error: "Failed to reset password." });
  }
}
