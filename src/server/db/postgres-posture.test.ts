import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("postgres enterprise posture assets", () => {
  it("defines restricted postgres roles and audit-table protections", () => {
    const sqlPath = path.resolve(process.cwd(), "scripts", "postgres", "roles-and-grants.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    expect(sql).toContain("CREATE ROLE valdoc_app");
    expect(sql).toContain("CREATE ROLE valdoc_admin");
    expect(sql).toContain("REVOKE UPDATE, DELETE ON TABLE \"AuditEvent\" FROM valdoc_app");
    expect(sql).toContain("REVOKE UPDATE, DELETE ON TABLE \"AuditEventDetail\" FROM valdoc_app");
    expect(sql).toContain("REVOKE UPDATE, DELETE ON TABLE \"ElectronicSignature\" FROM valdoc_app");
  });

  it("provides a postgres docker compose for test runs", () => {
    const composePath = path.resolve(process.cwd(), "docker-compose.postgres.yml");
    const compose = fs.readFileSync(composePath, "utf8");

    expect(compose).toContain("postgres:");
    expect(compose).toContain("POSTGRES_USER");
    expect(compose).toContain("POSTGRES_PASSWORD");
    expect(compose).toContain("POSTGRES_DB");
  });
});
