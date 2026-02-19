import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  userFindFirst: vi.fn(),
  versionFindFirst: vi.fn(),
  signatureCreate: vi.fn(),
  versionUpdate: vi.fn(),
  compare: vi.fn(),
  writeAuditEvent: vi.fn(),
  tx: vi.fn()
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
    user: { findFirst: mocks.userFindFirst },
    documentVersion: {
      findFirst: mocks.versionFindFirst,
      update: mocks.versionUpdate
    },
    electronicSignature: {
      create: mocks.signatureCreate
    },
    $transaction: mocks.tx
  }
}));

vi.mock("bcryptjs", () => ({
  compare: mocks.compare
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { POST } from "./route";

describe("POST /api/records/:type/:id/versions/:versionId/sign", () => {
  const originalEnforceTwoPersonRule = process.env.ENFORCE_TWO_PERSON_RULE;
  const originalEmergencyOverride = process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENFORCE_TWO_PERSON_RULE = originalEnforceTwoPersonRule;
    process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED = originalEmergencyOverride;
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      role: "APPROVER",
      email: "approver@qa.org"
    });
    mocks.userFindFirst.mockResolvedValue({
      id: "u1",
      fullName: "Reviewer User",
      passwordHash: "hash"
    });
    mocks.versionFindFirst.mockImplementation(async (args: { where?: { id?: string } }) => {
      if (args.where?.id === "v2") {
        return {
          id: "v2",
          versionNumber: 2,
          editedByUserId: "author-2",
          contentSnapshot: "{\"a\":1}",
          contentHash: null,
          generatedDocumentId: "d1",
          generatedDocument: {
            id: "d1",
            organizationId: "org1",
            status: "IN_REVIEW"
          }
        };
      }
      return {
        id: "v2",
        versionNumber: 2
      };
    });
    mocks.compare.mockResolvedValue(true);
    mocks.tx.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        electronicSignature: { create: mocks.signatureCreate },
        documentVersion: { update: mocks.versionUpdate },
        generatedDocument: { update: vi.fn() }
      })
    );
    mocks.signatureCreate.mockResolvedValue({ id: "sig1" });
    mocks.versionUpdate.mockResolvedValue({ id: "v2", signatureManifest: "abc123", contentHash: "abc123" });
  });

  it("rejects wrong password and audits denied attempt", async () => {
    mocks.compare.mockResolvedValue(false);
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meaning: "APPROVE", password: "wrong" })
      }),
      { params: Promise.resolve({ type: "generated-document", id: "d1", versionId: "v2" }) }
    );

    expect(response.status).toBe(401);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "signature.attempt",
        outcome: "DENIED"
      })
    );
  });

  it("rejects signing non-latest version", async () => {
    mocks.versionFindFirst.mockImplementation(async (args: { where?: { id?: string } }) => {
      if (args.where?.id === "v2") {
        return {
          id: "v2",
          versionNumber: 2,
          editedByUserId: "author-2",
          contentSnapshot: "{\"a\":1}",
          contentHash: null,
          generatedDocumentId: "d1",
          generatedDocument: { id: "d1", organizationId: "org1", status: "IN_REVIEW" }
        };
      }
      return { id: "v3", versionNumber: 3 };
    });
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meaning: "APPROVE", password: "Password123!" })
      }),
      { params: Promise.resolve({ type: "generated-document", id: "d1", versionId: "v2" }) }
    );

    expect(response.status).toBe(409);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "signature.attempt",
        outcome: "DENIED"
      })
    );
  });

  it("rejects signing with insufficient role", async () => {
    mocks.getSessionOrThrow.mockResolvedValueOnce({
      userId: "u2",
      organizationId: "org1",
      role: "VIEWER",
      email: "viewer@qa.org"
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meaning: "APPROVE", password: "Password123!" })
      }),
      { params: Promise.resolve({ type: "generated-document", id: "d1", versionId: "v2" }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "signature.attempt",
        outcome: "DENIED"
      })
    );
  });

  it("rejects meaning not allowed for record state", async () => {
    mocks.versionFindFirst.mockImplementation(async (args: { where?: { id?: string } }) => {
      if (args.where?.id === "v2") {
        return {
          id: "v2",
          versionNumber: 2,
          editedByUserId: "author-2",
          contentSnapshot: "{\"a\":1}",
          contentHash: null,
          generatedDocumentId: "d1",
          generatedDocument: { id: "d1", organizationId: "org1", status: "DRAFT" }
        };
      }
      return { id: "v2", versionNumber: 2 };
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meaning: "APPROVE", password: "Password123!" })
      }),
      { params: Promise.resolve({ type: "generated-document", id: "d1", versionId: "v2" }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "signature.attempt",
        outcome: "DENIED"
      })
    );
  });

  it("creates signature for latest version with successful audit", async () => {
    const txGeneratedUpdate = vi.fn();
    mocks.tx.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        electronicSignature: { create: mocks.signatureCreate },
        documentVersion: { update: mocks.versionUpdate },
        generatedDocument: { update: txGeneratedUpdate }
      })
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meaning: "APPROVE", password: "Password123!", remarks: "QA release approval" })
      }),
      { params: Promise.resolve({ type: "generated-document", id: "d1", versionId: "v2" }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.signatureCreate).toHaveBeenCalled();
    expect(mocks.versionUpdate).toHaveBeenCalled();
    expect(txGeneratedUpdate).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { status: "APPROVED" }
    });
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "signature.attempt",
        outcome: "SUCCESS"
      })
    );
  });

  it("enforces two-person rule when enabled", async () => {
    process.env.ENFORCE_TWO_PERSON_RULE = "true";
    mocks.versionFindFirst.mockImplementation(async (args: { where?: { id?: string } }) => {
      if (args.where?.id === "v2") {
        return {
          id: "v2",
          versionNumber: 2,
          editedByUserId: "u1",
          contentSnapshot: "{\"a\":1}",
          contentHash: null,
          generatedDocumentId: "d1",
          generatedDocument: { id: "d1", organizationId: "org1", status: "IN_REVIEW" }
        };
      }
      return { id: "v2", versionNumber: 2 };
    });
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meaning: "APPROVE", password: "Password123!" })
      }),
      { params: Promise.resolve({ type: "generated-document", id: "d1", versionId: "v2" }) }
    );

    expect(response.status).toBe(409);
  });

  it("allows same-user approval when two-person rule is disabled", async () => {
    process.env.ENFORCE_TWO_PERSON_RULE = "false";
    mocks.versionFindFirst.mockImplementation(async (args: { where?: { id?: string } }) => {
      if (args.where?.id === "v2") {
        return {
          id: "v2",
          versionNumber: 2,
          editedByUserId: "u1",
          contentSnapshot: "{\"a\":1}",
          contentHash: null,
          generatedDocumentId: "d1",
          generatedDocument: { id: "d1", organizationId: "org1", status: "IN_REVIEW" }
        };
      }
      return { id: "v2", versionNumber: 2 };
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meaning: "APPROVE", password: "Password123!" })
      }),
      { params: Promise.resolve({ type: "generated-document", id: "d1", versionId: "v2" }) }
    );

    expect(response.status).toBe(201);
  });

  it("allows admin emergency override with justification and writes override audit", async () => {
    process.env.ENFORCE_TWO_PERSON_RULE = "true";
    process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED = "true";
    mocks.getSessionOrThrow.mockResolvedValueOnce({
      userId: "u1",
      organizationId: "org1",
      role: "ADMIN",
      email: "admin@qa.org"
    });
    mocks.versionFindFirst.mockImplementation(async (args: { where?: { id?: string } }) => {
      if (args.where?.id === "v2") {
        return {
          id: "v2",
          versionNumber: 2,
          editedByUserId: "u1",
          contentSnapshot: "{\"a\":1}",
          contentHash: null,
          generatedDocumentId: "d1",
          generatedDocument: { id: "d1", organizationId: "org1", status: "IN_REVIEW" }
        };
      }
      return { id: "v2", versionNumber: 2 };
    });
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meaning: "APPROVE",
          password: "Password123!",
          emergency_override: true,
          override_justification: "Emergency release due to customer outage."
        })
      }),
      { params: Promise.resolve({ type: "generated-document", id: "d1", versionId: "v2" }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "signature.override.approval" })
    );
  });

  it("ignores client-supplied signed_at and uses server-generated signature time", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meaning: "APPROVE",
          password: "Password123!",
          signed_at: "1999-01-01T00:00:00.000Z"
        })
      }),
      { params: Promise.resolve({ type: "generated-document", id: "d1", versionId: "v2" }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.signatureCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          signedAt: "1999-01-01T00:00:00.000Z"
        })
      })
    );
  });
});
