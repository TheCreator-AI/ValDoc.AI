import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  userFindUnique: vi.fn(),
  organizationFindFirst: vi.fn()
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
    user: { findUnique: mocks.userFindUnique },
    organization: { findFirst: mocks.organizationFindFirst }
  }
}));

import { GET } from "./route";

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session user and selected organization", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u-master",
      organizationId: "org_amnion",
      role: "ADMIN",
      email: "aphvaldoc@gmail.com"
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "u-master",
      email: "aphvaldoc@gmail.com",
      fullName: "Platform Admin",
      role: "ADMIN"
    });
    mocks.organizationFindFirst.mockResolvedValue({
      id: "org_amnion",
      name: "Amnion"
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.organization.name).toBe("Amnion");
    expect(body.email).toBe("aphvaldoc@gmail.com");
  });

  it("returns auth errors from session guard", async () => {
    mocks.getSessionOrThrow.mockRejectedValue(new ApiError(401, "Authentication required."));
    const response = await GET();
    expect(response.status).toBe(401);
  });
});

