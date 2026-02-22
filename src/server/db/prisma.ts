import { PrismaClient } from "@prisma/client";
import { getRequiredEnv } from "@/server/config/env";
import { getOrgScopeContext } from "@/server/db/org-scope-context";
import { enforceOrgScopedArgs } from "@/server/db/org-scope";

const env = getRequiredEnv();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL
      }
    },
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (model === "AuditEvent" && ["update", "updateMany", "delete", "deleteMany", "upsert"].includes(operation)) {
          throw new Error("audit_events is append-only");
        }
        if (model === "DocumentExport" && ["update", "updateMany", "delete", "deleteMany", "upsert"].includes(operation)) {
          throw new Error("document_exports are immutable");
        }
        if (model === "DocumentVersion" && ["update", "updateMany"].includes(operation)) {
          const payload = (args ?? {}) as { data?: Record<string, unknown>; where?: Record<string, unknown> };
          const isContentMutation = typeof payload.data === "object" && payload.data !== null && "contentSnapshot" in payload.data;
          if (isContentMutation) {
            if (operation === "update") {
              const target = await basePrisma.documentVersion.findFirst({
                where: payload.where as never,
                select: { state: true }
              });
              if (target?.state === "APPROVED") {
                throw new Error("approved document_versions are immutable");
              }
            } else {
              const count = await basePrisma.documentVersion.count({
                where: {
                  ...(payload.where ?? {}),
                  state: "APPROVED"
                } as never
              });
              if (count > 0) {
                throw new Error("approved document_versions are immutable");
              }
            }
          }
        }
        const context = getOrgScopeContext();
        const nextArgs = enforceOrgScopedArgs({
          model,
          action: operation,
          args: args as Record<string, unknown> | undefined,
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          endpoint: context.endpoint,
          bypass: context.bypass
        });
        return await query((nextArgs ?? args) as never);
      }
    }
  }
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}
