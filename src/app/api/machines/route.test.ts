import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  machineFindMany: vi.fn(),
  machineCreate: vi.fn(),
  machineFindFirst: vi.fn(),
  machineDelete: vi.fn(),
  writeAuditEvent: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    machine: {
      findMany: mocks.machineFindMany,
      create: mocks.machineCreate,
      findFirst: mocks.machineFindFirst,
      delete: mocks.machineDelete
    }
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { DELETE, POST } from "./route";

describe("/api/machines route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN"
    });
  });

  it("writes audit event on machine create", async () => {
    mocks.machineCreate.mockResolvedValue({
      id: "m1",
      name: "Freezer",
      modelNumber: "TSX2320",
      manufacturer: "Thermo"
    });

    const response = await POST(
      new Request("http://localhost/api/machines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Freezer", modelNumber: "TSX2320", manufacturer: "Thermo" })
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "equipment.create",
        entityType: "Machine",
        entityId: "m1"
      })
    );
    expect(mocks.machineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org1"
        })
      })
    );
  });

  it("ignores client-supplied orgId and scopes to session org", async () => {
    mocks.machineCreate.mockResolvedValue({
      id: "m1",
      name: "Freezer",
      modelNumber: "TSX2320",
      manufacturer: "Thermo"
    });

    const response = await POST(
      new Request("http://localhost/api/machines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Freezer",
          modelNumber: "TSX2320",
          manufacturer: "Thermo",
          organizationId: "attacker-org"
        })
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.machineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org1"
        })
      })
    );
  });

  it("writes audit event on machine delete", async () => {
    mocks.machineFindFirst.mockResolvedValue({
      id: "m1",
      name: "Freezer",
      modelNumber: "TSX2320",
      manufacturer: "Thermo"
    });
    mocks.machineDelete.mockResolvedValue({ id: "m1" });

    const response = await DELETE(
      new Request("http://localhost/api/machines", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ machineId: "m1" })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "equipment.delete",
        entityType: "Machine",
        entityId: "m1"
      })
    );
  });
});
