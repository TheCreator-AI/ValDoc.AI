import { describe, expect, it } from "vitest";
import { hasPermission } from "@/server/auth/rbac";

describe("rbac permission matrix", () => {
  it("viewer cannot create/update/delete templates", () => {
    expect(hasPermission("VIEWER", "templates.create")).toBe(false);
    expect(hasPermission("VIEWER", "templates.update")).toBe(false);
    expect(hasPermission("VIEWER", "templates.delete")).toBe(false);
  });

  it("user can create templates but cannot approve templates", () => {
    expect(hasPermission("USER", "templates.create")).toBe(true);
    expect(hasPermission("USER", "templates.approve")).toBe(false);
  });

  it("reviewer can review but cannot approve templates or change user roles", () => {
    expect(hasPermission("REVIEWER", "templates.approve")).toBe(false);
    expect(hasPermission("REVIEWER", "users.manage_roles")).toBe(false);
  });

  it("approver can approve templates but cannot manage roles", () => {
    expect(hasPermission("APPROVER", "templates.approve")).toBe(true);
    expect(hasPermission("APPROVER", "users.manage_roles")).toBe(false);
  });

  it("admin can manage roles and read audit logs", () => {
    expect(hasPermission("ADMIN", "users.manage_roles")).toBe(true);
    expect(hasPermission("ADMIN", "audit.read")).toBe(true);
    expect(hasPermission("ADMIN", "organizations.manage")).toBe(true);
  });

  it("legacy engineer/author roles map to user permissions", () => {
    expect(hasPermission("ENGINEER", "templates.create")).toBe(true);
    expect(hasPermission("ENGINEER", "templates.approve")).toBe(false);
    expect(hasPermission("AUTHOR", "templates.create")).toBe(true);
    expect(hasPermission("AUTHOR", "templates.approve")).toBe(false);
  });
});
