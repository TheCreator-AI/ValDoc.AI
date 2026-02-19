export type Role = "ADMIN" | "USER" | "APPROVER" | "REVIEWER" | "VIEWER" | "AUTHOR" | "ENGINEER";

export type Permission =
  | "templates.read"
  | "templates.create"
  | "templates.update"
  | "templates.delete"
  | "templates.approve"
  | "equipment.read"
  | "equipment.write"
  | "units.read"
  | "units.write"
  | "documents.generate"
  | "audit.read"
  | "users.manage_roles"
  | "organizations.manage";

type CanonicalRole = "ADMIN" | "USER" | "APPROVER" | "REVIEWER" | "VIEWER";

const normalizeRole = (role: Role): CanonicalRole => {
  if (role === "ENGINEER" || role === "AUTHOR") return "USER";
  return role;
};

const roleHierarchy: Record<CanonicalRole, number> = {
  VIEWER: 1,
  REVIEWER: 2,
  APPROVER: 3,
  USER: 4,
  ADMIN: 5
};

const permissionMatrix: Record<CanonicalRole, Set<Permission>> = {
  ADMIN: new Set<Permission>([
    "templates.read",
    "templates.create",
    "templates.update",
    "templates.delete",
    "templates.approve",
    "equipment.read",
    "equipment.write",
    "units.read",
    "units.write",
    "documents.generate",
    "audit.read",
    "users.manage_roles",
    "organizations.manage"
  ]),
  USER: new Set<Permission>([
    "templates.read",
    "templates.create",
    "templates.update",
    "equipment.read",
    "equipment.write",
    "units.read",
    "units.write",
    "documents.generate"
  ]),
  APPROVER: new Set<Permission>([
    "templates.read",
    "templates.approve",
    "equipment.read",
    "units.read"
  ]),
  REVIEWER: new Set<Permission>([
    "templates.read",
    "equipment.read",
    "units.read"
  ]),
  VIEWER: new Set<Permission>(["templates.read", "equipment.read", "units.read"])
};

export const hasRole = (userRole: Role, minimumRole: Role) => {
  return roleHierarchy[normalizeRole(userRole)] >= roleHierarchy[normalizeRole(minimumRole)];
};

export const hasPermission = (userRole: Role, permission: Permission) => {
  return permissionMatrix[normalizeRole(userRole)].has(permission);
};
