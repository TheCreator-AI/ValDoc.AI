import { prisma } from "@/server/db/prisma";
import { ApiError, apiJson, getSessionOrThrow } from "@/server/api/http";

export async function GET() {
  try {
    const session = await getSessionOrThrow();

    const [user, organization] = await Promise.all([
      prisma.user.findUnique({
        where: {
          id: session.userId
        }
      }),
      prisma.organization.findFirst({
        where: { id: session.organizationId, isActive: true },
        select: { id: true, name: true }
      })
    ]);

    if (!user || !organization) {
      return apiJson(404, { error: "User or organization not found." });
    }

    return apiJson(200, {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organization: {
        id: organization.id,
        name: organization.name
      }
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiJson(error.status, { error: error.message });
    }
    return apiJson(500, { error: "Failed to load session." });
  }
}
