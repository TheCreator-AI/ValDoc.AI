import { apiJson } from "@/server/api/http";
import { prisma } from "@/server/db/prisma";
import { runWithoutOrgScope } from "@/server/db/org-scope-context";

export async function GET() {
  return await runWithoutOrgScope(async () => {
    try {
      await prisma.organization.count();
      return apiJson(200, {
        status: "ok",
        database: "ok",
        timestamp: new Date().toISOString()
      });
    } catch {
      return apiJson(503, {
        status: "error",
        database: "error",
        timestamp: new Date().toISOString()
      });
    }
  });
}
