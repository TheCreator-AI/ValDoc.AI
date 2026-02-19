import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  templateFindFirst: vi.fn(),
  templateFindMany: vi.fn(),
  templateCreate: vi.fn(),
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
      findMany: mocks.templateFindMany,
      create: mocks.templateCreate,
      update: mocks.templateUpdate
    }
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { DELETE, PATCH } from "./route";

describe("/api/templates/:templateId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrowWithPermission.mockRejectedValue(new ApiError(403, "Insufficient permissions."));
  });

  it("denies viewer update template", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/templates/t1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Updated" })
      }),
      { params: Promise.resolve({ templateId: "t1" }) }
    );
    expect(response.status).toBe(403);
  });

  it("denies viewer retire template", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/templates/t1", { method: "DELETE" }),
      { params: Promise.resolve({ templateId: "t1" }) }
    );
    expect(response.status).toBe(403);
  });

  it("increments version and writes audit event on template update", async () => {
    mocks.getSessionOrThrowWithPermission.mockResolvedValueOnce({
      userId: "author1",
      organizationId: "org1",
      role: "AUTHOR"
    });
    mocks.templateFindFirst.mockResolvedValueOnce({
      id: "t1",
      templateId: "tmpl-1",
      version: 1,
      organizationId: "org1",
      docType: "URS",
      contentTemplate: "old content",
      templateKind: "EXAMPLE",
      sourceFileName: "v1.docx",
      sourceFilePath: "/tmp/v1.docx",
      sourceMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      title: "Template v1"
    });
    mocks.templateFindMany.mockResolvedValueOnce([{ version: 1 }]);
    mocks.templateCreate.mockResolvedValueOnce({
      id: "t1",
      templateId: "tmpl-1",
      version: 2,
      title: "Updated",
      status: "DRAFT"
    });

    const response = await PATCH(
      new Request("http://localhost/api/templates/t1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Updated" })
      }),
      { params: Promise.resolve({ templateId: "t1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.templateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateId: "tmpl-1",
          version: 2,
          status: "DRAFT"
        })
      })
    );
    expect(mocks.templateUpdate).not.toHaveBeenCalled();
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "template.update",
        entityType: "DocumentTemplate",
        entityId: "t1",
        details: expect.objectContaining({ previousVersion: 1, newVersion: 2 })
      })
    );
  });
});
