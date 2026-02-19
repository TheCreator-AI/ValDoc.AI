import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  findFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  createAuditEvent: vi.fn()
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
    equipmentFact: {
      findFirst: mocks.findFact,
      update: mocks.updateFact,
      delete: mocks.deleteFact
    },
    auditEvent: { create: mocks.createAuditEvent }
  }
}));

import { PATCH, DELETE } from "./route";
import { ApiError } from "@/server/api/http";

describe("fact detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFact.mockResolvedValue({ id: "f1", organizationId: "org1" });
  });

  it("updates fact and records audit", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.updateFact.mockResolvedValue({ id: "f1", key: "temp" });
    mocks.createAuditEvent.mockResolvedValue({ id: "a1" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "3-7", confidence: 0.9 })
      }),
      { params: Promise.resolve({ machineId: "m1", factId: "f1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.createAuditEvent).toHaveBeenCalled();
  });

  it("enforces admin permission on delete", async () => {
    mocks.getSessionOrThrow.mockRejectedValue(new ApiError(403, "Insufficient permissions."));

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ machineId: "m1", factId: "f1" }) }
    );

    expect(response.status).toBe(403);
  });
});
