import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRawUnsafe: vi.fn(),
  queryRawUnsafe: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $executeRawUnsafe: mocks.executeRawUnsafe,
    $queryRawUnsafe: mocks.queryRawUnsafe
  }
}));

import { ensureDatabaseInitialized } from "@/server/db/bootstrap";

describe("migration bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRawUnsafe.mockResolvedValue(undefined);
    mocks.queryRawUnsafe.mockResolvedValue([]);
  });

  it("applies idempotent migration statements on an empty database", async () => {
    await expect(ensureDatabaseInitialized()).resolves.not.toThrow();
    expect(mocks.executeRawUnsafe).toHaveBeenCalled();
    const calls = mocks.executeRawUnsafe.mock.calls.map((args) => String(args[0]));
    expect(calls.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS \"Organization\""))).toBe(true);
    expect(calls.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS \"DeploymentConfig\""))).toBe(true);
    expect(calls.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS \"AuditChainHead\""))).toBe(true);
    expect(calls.some((statement) => statement.includes("CREATE TRIGGER \"AuditEventDetail_no_update\""))).toBe(true);
    expect(calls.some((statement) => statement.includes("CREATE TRIGGER \"AuditEventDetail_no_delete\""))).toBe(true);
    expect(calls.some((statement) => statement.includes("CREATE TRIGGER \"ElectronicSignature_no_update\""))).toBe(true);
    expect(calls.some((statement) => statement.includes("CREATE TRIGGER \"ElectronicSignature_no_delete\""))).toBe(true);
    expect(calls.some((statement) => statement.includes("CREATE TRIGGER \"DocumentVersion_no_delete\""))).toBe(true);
    expect(calls.some((statement) => statement.includes("CREATE TRIGGER \"AppRelease_no_update_after_signature\""))).toBe(true);
    expect(calls.some((statement) => statement.includes("CREATE TRIGGER \"AppRelease_no_delete\""))).toBe(true);
  });
});
