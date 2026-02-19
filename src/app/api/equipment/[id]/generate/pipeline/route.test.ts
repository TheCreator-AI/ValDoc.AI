import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  runGenerationPipeline: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow
  };
});

vi.mock("@/server/pipeline/service", () => ({
  runGenerationPipeline: mocks.runGenerationPipeline
}));

import { POST } from "./route";

describe("POST /api/equipment/:id/generate/pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ENGINEER"
    });
    mocks.runGenerationPipeline.mockResolvedValue({
      jobId: "job1",
      readyForExport: true,
      documents: []
    });
  });

  it("runs pipeline and returns result", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intendedUse: "Store samples",
          selectedDocTypes: ["URS", "RID", "IOQ", "OQ", "TRACEABILITY"]
        })
      }),
      { params: Promise.resolve({ id: "m1" }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.runGenerationPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org1",
        userId: "u1",
        machineId: "m1"
      })
    );
  });

  it("enforces authorization", async () => {
    mocks.getSessionOrThrow.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      }),
      { params: Promise.resolve({ id: "m1" }) }
    );
    expect(response.status).toBe(403);
  });
});
