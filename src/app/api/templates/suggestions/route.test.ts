import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  templateFindMany: vi.fn(),
  documentFindMany: vi.fn(),
  isFeatureEnabled: vi.fn()
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
    documentTemplate: { findMany: mocks.templateFindMany },
    generatedDocument: { findMany: mocks.documentFindMany }
  }
}));

vi.mock("@/server/config/features", () => ({
  isFeatureEnabled: mocks.isFeatureEnabled
}));

import { GET } from "./route";

describe("GET /api/templates/suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN",
      email: "admin@test.local"
    });
    mocks.isFeatureEnabled.mockReturnValue(true);
    mocks.templateFindMany.mockResolvedValue([{ contentTemplate: "REQ-1 shall..." }]);
    mocks.documentFindMany.mockResolvedValue([{ currentContent: "REQ-2 shall..." }]);
  });

  it("blocks suggestions when client feature flag is disabled", async () => {
    mocks.isFeatureEnabled.mockReturnValue(false);
    const response = await GET(new Request("http://localhost/api/templates/suggestions?docType=URS"));
    expect(response.status).toBe(404);
  });

  it("returns suggestions when feature is enabled", async () => {
    const response = await GET(new Request("http://localhost/api/templates/suggestions?docType=URS"));
    expect(response.status).toBe(200);
  });
});
