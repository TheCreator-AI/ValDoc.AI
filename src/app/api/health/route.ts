import { apiJson } from "@/server/api/http";
import { prisma } from "@/server/db/prisma";

export async function GET() {
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
}
