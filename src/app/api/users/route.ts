import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

export async function GET() {
  try {
    const session = await getSessionOrThrow("ADMIN");
    const users = await prisma.user.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        userStatus: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true
      }
    });
    return apiJson(200, users);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to list users." });
  }
}
