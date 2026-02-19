import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  findMachine: vi.fn(),
  createManyFacts: vi.fn(),
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
    equipmentFact: { createMany: mocks.createManyFacts },
    auditEvent: { create: mocks.createAuditEvent }
  }
}));

import { POST } from "./route";

describe("facts import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.findMachine.mockResolvedValue({ id: "m1", organizationId: "org1" });
    mocks.createManyFacts.mockResolvedValue({ count: 2 });
    mocks.createAuditEvent.mockResolvedValue({ id: "a1" });
  });

  it("validates payload and rejects invalid import", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts: [{ key: "temp" }] })
      }),
      { params: Promise.resolve({ machineId: "m1" }) }
    );

    expect(response.status).toBe(400);
  });

  it("imports valid facts and logs audit", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facts: [
            {
              fact_type: "RANGE",
              key: "temperature_range",
              value: "2-8",
              units: "C",
              source_ref: "manual p12",
              confidence: 0.9
            },
            {
              fact_type: "UTILITY",
              key: "power_supply",
              value: "230V",
              units: "VAC",
              source_ref: "datasheet p2",
              confidence: 0.88
            }
          ]
        })
      }),
      { params: Promise.resolve({ machineId: "m1" }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.createManyFacts).toHaveBeenCalled();
    expect(mocks.createAuditEvent).toHaveBeenCalled();
  });
});
