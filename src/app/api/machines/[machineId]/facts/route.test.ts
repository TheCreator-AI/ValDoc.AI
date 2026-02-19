import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  findMachine: vi.fn(),
  listFacts: vi.fn(),
  createFact: vi.fn(),
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
    machine: { findFirst: mocks.findMachine },
    equipmentFact: { findMany: mocks.listFacts, create: mocks.createFact },
    auditEvent: { create: mocks.createAuditEvent }
  }
}));

import { GET, POST } from "./route";
import { ApiError } from "@/server/api/http";

describe("facts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMachine.mockResolvedValue({ id: "m1", organizationId: "org1" });
  });

  it("lists facts for machine", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.listFacts.mockResolvedValue([{ id: "f1", key: "temperature_range" }]);

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ machineId: "m1" }) });
    expect(response.status).toBe(200);
  });

  it("enforces permission on create", async () => {
    mocks.getSessionOrThrow.mockRejectedValue(new ApiError(403, "Insufficient permissions."));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_type: "RANGE", key: "temp", value: "2-8" })
      }),
      { params: Promise.resolve({ machineId: "m1" }) }
    );

    expect(response.status).toBe(403);
  });

  it("creates fact and writes audit event", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.createFact.mockResolvedValue({ id: "f1" });
    mocks.createAuditEvent.mockResolvedValue({ id: "a1" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fact_type: "RANGE",
          key: "temperature_range",
          value: "2-8",
          units: "C",
          source_ref: "manual p.12 sec.4",
          confidence: 0.95
        })
      }),
      { params: Promise.resolve({ machineId: "m1" }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.createAuditEvent).toHaveBeenCalled();
  });

  it("creates fact even when audit write fails", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.createFact.mockResolvedValue({ id: "f1" });
    mocks.createAuditEvent.mockRejectedValue(new Error("audit failed"));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fact_type: "RANGE",
          key: "temperature_range",
          value: "2-8"
        })
      }),
      { params: Promise.resolve({ machineId: "m1" }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.createAuditEvent).toHaveBeenCalled();
  });
});
