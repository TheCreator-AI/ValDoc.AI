import { AsyncLocalStorage } from "node:async_hooks";

type OrgScopeContext = {
  organizationId?: string;
  actorUserId?: string;
  requestId?: string;
  endpoint?: string;
  bypass?: boolean;
};

const storage = new AsyncLocalStorage<OrgScopeContext>();

type OrgContextInput = string | Omit<OrgScopeContext, "bypass">;

const toContext = (input: OrgContextInput): OrgScopeContext => {
  if (typeof input === "string") {
    return { organizationId: input };
  }
  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    endpoint: input.endpoint
  };
};

export const setRequestOrgContext = (input: OrgContextInput) => {
  const next = toContext(input);
  const current = storage.getStore();
  storage.enterWith({ ...current, ...next });
};

export const runWithOrgContext = async <T>(input: OrgContextInput, fn: () => Promise<T>) => {
  return await storage.run(toContext(input), fn);
};

export const runWithoutOrgScope = async <T>(fn: () => Promise<T>) => {
  return await storage.run({ bypass: true }, fn);
};

export const getOrgScopeContext = () => storage.getStore() ?? {};
