import { recordOrgBoundaryAttempt } from "@/server/security/orgBoundary";

const orgOwnedModels = new Set([
  "Organization",
  "User",
  "Machine",
  "EquipmentFact",
  "AuditEvent",
  "AuditEventDetail",
  "AuditChainHead",
  "SourceDocument",
  "SourceChunk",
  "GenerationJob",
  "GeneratedDocument",
  "TraceabilityLink",
  "DocumentTemplate",
  "DocumentExport",
  "MachineVendorDocument",
  "UnitExecutedDocument",
  "LabGroup",
  "ChangeControl",
  "RetentionPolicy",
  "LegalHold",
  "RetentionPurgeRun",
  "ElectronicSignature",
  "AppRelease",
  "AccessReviewReport",
  "AuditVerificationReport",
  "UserSession"
]);

const actionsWithWhere = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert"
]);

const actionsWithCreateData = new Set(["create", "createMany", "upsert", "update", "updateMany"]);

const mergeWhere = (
  where: Record<string, unknown> | undefined,
  organizationId: string,
  onViolation: (targetOrgId: string | undefined, reason: "cross_org_query") => never
) => {
  if (!where) return { organizationId };
  const existingOrg = (where as { organizationId?: unknown }).organizationId;
  if (existingOrg !== undefined && existingOrg !== organizationId) {
    onViolation(typeof existingOrg === "string" ? existingOrg : undefined, "cross_org_query");
  }
  return {
    AND: [where, { organizationId }]
  };
};

const enforceDataOrg = (
  data: unknown,
  organizationId: string,
  onViolation: (targetOrgId: string | undefined, reason: "cross_org_write") => never
): unknown => {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map((item) => enforceDataOrg(item, organizationId, onViolation));
  }
  const record = data as Record<string, unknown>;
  const existingOrg = record.organizationId;
  if (existingOrg !== undefined && existingOrg !== organizationId) {
    onViolation(typeof existingOrg === "string" ? existingOrg : undefined, "cross_org_write");
  }
  return { ...record, organizationId };
};

export const enforceOrgScopedArgs = (params: {
  model?: string;
  action: string;
  args: Record<string, unknown> | undefined;
  organizationId?: string;
  actorUserId?: string;
  requestId?: string;
  endpoint?: string;
  bypass?: boolean;
}) => {
  const { model, action, organizationId, actorUserId, requestId, endpoint, bypass } = params;
  if (!model || !orgOwnedModels.has(model)) {
    return params.args;
  }
  if (bypass) return params.args;
  const operation = `${model}.${action}`;
  const emitBoundaryError = (
    targetOrgId: string | undefined,
    reason: "cross_org_query" | "cross_org_write" | "unscoped_org_owned_model"
  ): never => {
    const result = recordOrgBoundaryAttempt({
      actorUserId,
      actorOrgId: organizationId,
      targetOrgId,
      operation,
      endpoint: endpoint ?? `db:${operation}`,
      requestId,
      reason
    });
    if (result.blocked) {
      throw new Error(`Cross-organization access blocked due to repeated attempts. requestId=${result.requestId}`);
    }
    throw new Error(`Cross-organization access blocked. requestId=${result.requestId}`);
  };
  const scopedOrganizationId = organizationId;
  if (!scopedOrganizationId) {
    if (process.env.NODE_ENV === "test") return params.args;
    emitBoundaryError(undefined, "unscoped_org_owned_model");
  }
  const requiredOrganizationId = scopedOrganizationId as string;

  const args = { ...(params.args ?? {}) } as Record<string, unknown>;

  if (actionsWithWhere.has(action)) {
    args.where = mergeWhere(args.where as Record<string, unknown> | undefined, requiredOrganizationId, emitBoundaryError);
  }

  if (actionsWithCreateData.has(action)) {
    if (action === "upsert") {
      args.create = enforceDataOrg(args.create, requiredOrganizationId, emitBoundaryError);
      args.update = enforceDataOrg(args.update, requiredOrganizationId, emitBoundaryError);
    } else if (action === "createMany") {
      args.data = enforceDataOrg(args.data, requiredOrganizationId, emitBoundaryError);
    } else {
      args.data = enforceDataOrg(args.data, requiredOrganizationId, emitBoundaryError);
    }
  }

  return args;
};
