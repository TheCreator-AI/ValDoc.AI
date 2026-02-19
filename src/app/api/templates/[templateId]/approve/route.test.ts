import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  templateFindFirst: vi.fn(),
  templateUpdate: vi.fn(),
  writeAuditEvent: vi.fn()
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrowWithPermission: mocks.getSessionOrThrowWithPermission
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    documentTemplate: {
      findFirst: mocks.templateFindFirst,
      update: mocks.templateUpdate
    }
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { POST } from "./route";

describe("POST /api/templates/:templateId/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies author approval", async () => {
    mocks.getSessionOrThrowWithPermission.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));

    const response = await POST(
      new Request("http://localhost/api/templates/t1/approve", { method: "POST" }),
      { params: Promise.resolve({ templateId: "t1" }) }
    );
    expect(response.status).toBe(403);
  });

  it("allows reviewer approval", async () => {
    mocks.getSessionOrThrowWithPermission.mockResolvedValueOnce({
      userId: "r1",
      organizationId: "org1",
      role: "REVIEWER"
    });
    mocks.templateFindFirst.mockResolvedValueOnce({ id: "t1", templateId: "tmpl-1", version: 2, docType: "URS", title: "URS Draft" });
    mocks.templateUpdate.mockResolvedValueOnce({ id: "t1", templateId: "tmpl-1", version: 2, docType: "URS", title: "URS Draft", status: "APPROVED" });

    const response = await POST(
      new Request("http://localhost/api/templates/t1/approve", { method: "POST" }),
      { params: Promise.resolve({ templateId: "t1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.templateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          approvedByUserId: "r1"
        })
      })
    );
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "template.approve",
        entityType: "DocumentTemplate",
        entityId: "t1"
      })
    );
  });

  it("approving a version does not mutate historical versions", async () => {
    mocks.getSessionOrThrowWithPermission.mockResolvedValueOnce({
      userId: "r1",
      organizationId: "org1",
      role: "REVIEWER"
    });
    mocks.templateFindFirst.mockResolvedValueOnce({ id: "t2", templateId: "tmpl-1", version: 3, docType: "URS", title: "URS v3" });
    mocks.templateUpdate.mockResolvedValueOnce({ id: "t2", templateId: "tmpl-1", version: 3, docType: "URS", title: "URS v3", status: "APPROVED" });

    const response = await POST(
      new Request("http://localhost/api/templates/t2/approve", { method: "POST" }),
      { params: Promise.resolve({ templateId: "t2" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.templateUpdate.mock.calls.length).toBe(1);
  });

  it("rejects approving retired template versions", async () => {
    mocks.getSessionOrThrowWithPermission.mockResolvedValueOnce({
      userId: "r1",
      organizationId: "org1",
      role: "REVIEWER"
    });
    mocks.templateFindFirst.mockResolvedValueOnce({ id: "t3", templateId: "tmpl-1", version: 2, status: "RETIRED", docType: "URS", title: "Retired" });

    const response = await POST(
      new Request("http://localhost/api/templates/t3/approve", { method: "POST" }),
      { params: Promise.resolve({ templateId: "t3" }) }
    );

    expect(response.status).toBe(409);
  });
});
