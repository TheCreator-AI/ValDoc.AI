import { prisma } from "@/server/db/prisma";
import { apiJson } from "@/server/api/http";
import { ensureDatabaseInitialized } from "@/server/db/bootstrap";
import { runWithoutOrgScope } from "@/server/db/org-scope-context";

export async function GET() {
  return await runWithoutOrgScope(async () => {
    await ensureDatabaseInitialized();
    const count = await prisma.organization.count();
    return apiJson(200, { requiresSetup: count === 0 });
  });
}
