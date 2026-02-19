import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrowWithPermission: vi.fn(),
  templateFindMany: vi.fn(),
  templateCount: vi.fn(),
  templateCreate: vi.fn(),
  saveUploadedFile: vi.fn(),
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
      findMany: mocks.templateFindMany,
      count: mocks.templateCount,
      create: mocks.templateCreate
    }
  }
}));

vi.mock("@/server/files/storage", () => ({
  saveUploadedFile: mocks.saveUploadedFile
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { POST } from "./route";

describe("POST /api/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when viewer attempts template create", async () => {
    mocks.getSessionOrThrowWithPermission.mockRejectedValueOnce(new ApiError(403, "Insufficient permissions."));

    const formData = new FormData();
    formData.set("docType", "URS");
    formData.append("files", new File(["template"], "urs-template.txt", { type: "text/plain" }));

    const response = await POST(
      new Request("http://localhost/api/templates", {
        method: "POST",
        body: formData
      })
    );

    expect(response.status).toBe(403);
  });
});
