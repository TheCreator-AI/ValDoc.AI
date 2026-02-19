import { prisma } from "@/server/db/prisma";
import { apiJson } from "@/server/api/http";
import { ensureDatabaseInitialized } from "@/server/db/bootstrap";

export async function GET() {
  await ensureDatabaseInitialized();
  const count = await prisma.organization.count();
  return apiJson(200, { requiresSetup: count === 0 });
}
