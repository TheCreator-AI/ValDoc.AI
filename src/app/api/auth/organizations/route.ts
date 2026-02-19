import { apiJson } from "@/server/api/http";
import { prisma } from "@/server/db/prisma";
import { ensureDatabaseInitialized } from "@/server/db/bootstrap";

export async function GET() {
  const customerId = (process.env.CUSTOMER_ID ?? "").trim();
  const orgName = (process.env.ORG_NAME ?? "").trim();

  if (customerId && orgName) {
    return apiJson(200, [{ id: customerId, name: orgName }]);
  }

  try {
    await ensureDatabaseInitialized();
    const organizations = await prisma.organization.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    });
    return apiJson(200, organizations);
  } catch {
    return apiJson(200, []);
  }
}
