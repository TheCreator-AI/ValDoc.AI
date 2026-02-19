import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  findMachine: vi.fn(),
  listUploads: vi.fn()
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
    sourceDocument: { findMany: mocks.listUploads }
  }
}));

import { GET } from "./route";
import { ApiError } from "@/server/api/http";

describe("machine uploads route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMachine.mockResolvedValue({ id: "m1", organizationId: "org1" });
  });

  it("rejects unauthenticated caller", async () => {
    mocks.getSessionOrThrow.mockRejectedValue(new ApiError(401, "Authentication required."));

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ machineId: "m1" })
    });

    expect(response.status).toBe(401);
  });

  it("lists uploads for machine", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({ userId: "u1", organizationId: "org1", role: "ENGINEER" });
    mocks.listUploads.mockResolvedValue([
      {
        id: "sd1",
        fileName: "TSX2320 User Manual v2.1.pdf",
        createdAt: new Date("2026-02-17T00:00:00.000Z")
      }
    ]);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ machineId: "m1" })
    });

    expect(response.status).toBe(200);
  });
});
