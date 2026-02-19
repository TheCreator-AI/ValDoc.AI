import { apiJson } from "@/server/api/http";
import { prisma } from "@/server/db/prisma";
import { ensureDatabaseInitialized } from "@/server/db/bootstrap";

export async function GET() {
  await ensureDatabaseInitialized();
  const organizations = await prisma.organization.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });
  return apiJson(200, organizations);
}

