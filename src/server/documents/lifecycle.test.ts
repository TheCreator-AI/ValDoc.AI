import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  versionFindFirst: vi.fn(),
  versionFindMany: vi.fn(),
  versionCreate: vi.fn(),
  versionUpdate: vi.fn(),
  generatedFindFirst: vi.fn(),
  generatedUpdate: vi.fn(),
  generatedDelete: vi.fn(),
  signatureFindMany: vi.fn(),
  writeAuditEvent: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    documentVersion: {
      findFirst: mocks.versionFindFirst,
      findMany: mocks.versionFindMany,
      create: mocks.versionCreate,
      update: mocks.versionUpdate
    },
    generatedDocument: {
      findFirst: mocks.generatedFindFirst,
      update: mocks.generatedUpdate,
      delete: mocks.generatedDelete
    },
    electronicSignature: {
      findMany: mocks.signatureFindMany
    }
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { createDocumentVersion, listDocumentVersionHistory, softDeleteRegulatedDocument, transitionDocumentVersionState } from "@/server/documents/lifecycle";

describe("document lifecycle service", () => {
  const originalEnforceTwoPersonRule = process.env.ENFORCE_TWO_PERSON_RULE;
  const originalEmergencyOverride = process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENFORCE_TWO_PERSON_RULE = originalEnforceTwoPersonRule;
    process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED = originalEmergencyOverride;
    mocks.versionFindFirst.mockResolvedValue({
      id: "v2",
      versionNumber: 2,
      state: "IN_REVIEW",
      editedByUserId: "author1",
      contentSnapshot: "{\"x\":1}",
      changeComment: null
    });
    mocks.versionCreate.mockResolvedValue({ id: "v3", versionNumber: 3, state: "DRAFT" });
    mocks.versionUpdate.mockResolvedValue({ id: "v2", state: "IN_REVIEW" });
    mocks.versionFindMany.mockResolvedValue([]);
    mocks.generatedFindFirst.mockResolvedValue({ id: "d1", deletedAt: null, status: "DRAFT" });
    mocks.generatedUpdate.mockResolvedValue({});
    mocks.signatureFindMany.mockResolvedValue([]);
    mocks.writeAuditEvent.mockResolvedValue(undefined);
  });

  it("creates a new draft version and never edits existing approved versions", async () => {
    const created = await createDocumentVersion({
      organizationId: "org1",
      documentId: "d1",
      actorUserId: "u1",
      changeReason: "address review comments",
      contentJson: "{\"x\":2}"
    });
    expect(created.id).toBe("v3");
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.version.create",
        fieldChanges: expect.arrayContaining([
          expect.objectContaining({
            changePath: "x",
            oldValue: "1",
            newValue: "2"
          })
        ])
      })
    );

    mocks.versionFindFirst.mockResolvedValueOnce({
      id: "v2",
      versionNumber: 2,
      state: "APPROVED",
      editedByUserId: "author1",
      contentSnapshot: "{\"x\":1}",
      changeComment: null
    });
    await expect(
      createDocumentVersion({
        organizationId: "org1",
        documentId: "d1",
        actorUserId: "u1",
        changeReason: "post-approval edit"
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("blocks direct DRAFT to APPROVED transition", async () => {
    mocks.versionFindFirst.mockResolvedValueOnce({
      id: "v1",
      versionNumber: 1,
      state: "DRAFT",
      editedByUserId: "author1",
      contentSnapshot: "{\"x\":1}",
      changeComment: null
    });
    await expect(
      transitionDocumentVersionState({
        organizationId: "org1",
        documentId: "d1",
        versionId: "v1",
        actorUserId: "u1",
        actorRole: "REVIEWER",
        toState: "APPROVED"
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects transition when actor role is not allowed for target state", async () => {
    await expect(
      transitionDocumentVersionState({
        organizationId: "org1",
        documentId: "d1",
        versionId: "v2",
        actorUserId: "u1",
        actorRole: "VIEWER",
        toState: "IN_REVIEW"
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("blocks obsolete transition without replacement or justification", async () => {
    mocks.versionFindFirst.mockResolvedValueOnce({
      id: "v2",
      versionNumber: 2,
      state: "APPROVED",
      editedByUserId: "author1",
      contentSnapshot: "{\"x\":1}",
      changeComment: null
    });
    await expect(
      transitionDocumentVersionState({
        organizationId: "org1",
        documentId: "d1",
        versionId: "v2",
        actorUserId: "u1",
        actorRole: "REVIEWER",
        toState: "OBSOLETE"
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("allows same-user approval when two-person rule is disabled", async () => {
    process.env.ENFORCE_TWO_PERSON_RULE = "false";
    mocks.versionFindFirst.mockResolvedValueOnce({
      id: "v2",
      versionNumber: 2,
      state: "IN_REVIEW",
      editedByUserId: "u1",
      contentSnapshot: "{\"x\":1}",
      changeComment: null
    });

    await expect(
      transitionDocumentVersionState({
        organizationId: "org1",
        documentId: "d1",
        versionId: "v2",
        actorUserId: "u1",
        actorRole: "REVIEWER",
        toState: "APPROVED"
      })
    ).resolves.toBeTruthy();
  });

  it("rejects APPROVED transition when version is not latest", async () => {
    process.env.ENFORCE_TWO_PERSON_RULE = "false";
    mocks.versionFindFirst
      .mockResolvedValueOnce({
        id: "v2",
        versionNumber: 2,
        state: "IN_REVIEW",
        editedByUserId: "author1",
        contentSnapshot: "{\"x\":1}",
        changeComment: null
      })
      .mockResolvedValueOnce({ id: "v3" });

    await expect(
      transitionDocumentVersionState({
        organizationId: "org1",
        documentId: "d1",
        versionId: "v2",
        actorUserId: "u2",
        actorRole: "REVIEWER",
        toState: "APPROVED"
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("locks content immutably after APPROVED by blocking successor draft creation", async () => {
    mocks.versionFindFirst.mockResolvedValueOnce({
      id: "v2",
      versionNumber: 2,
      state: "APPROVED",
      editedByUserId: "author1",
      contentSnapshot: "{\"x\":1}",
      changeComment: null
    });

    await expect(
      createDocumentVersion({
        organizationId: "org1",
        documentId: "d1",
        actorUserId: "u1",
        changeReason: "attempt edit after approval",
        contentJson: "{\"x\":2}"
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("blocks same-user approval when two-person rule is enabled", async () => {
    process.env.ENFORCE_TWO_PERSON_RULE = "true";
    process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED = "false";
    mocks.versionFindFirst.mockResolvedValueOnce({
      id: "v2",
      versionNumber: 2,
      state: "IN_REVIEW",
      editedByUserId: "u1",
      contentSnapshot: "{\"x\":1}",
      changeComment: null
    });

    await expect(
      transitionDocumentVersionState({
        organizationId: "org1",
        documentId: "d1",
        versionId: "v2",
        actorUserId: "u1",
        actorRole: "REVIEWER",
        toState: "APPROVED"
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("allows admin override with justification when override mode is enabled", async () => {
    process.env.ENFORCE_TWO_PERSON_RULE = "true";
    process.env.EMERGENCY_APPROVAL_OVERRIDE_ENABLED = "true";
    mocks.versionFindFirst.mockResolvedValueOnce({
      id: "v2",
      versionNumber: 2,
      state: "IN_REVIEW",
      editedByUserId: "u1",
      contentSnapshot: "{\"x\":1}",
      changeComment: null
    });

    await expect(
      transitionDocumentVersionState({
        organizationId: "org1",
        documentId: "d1",
        versionId: "v2",
        actorUserId: "u1",
        actorRole: "ADMIN",
        toState: "APPROVED",
        emergencyOverride: true,
        overrideJustification: "Emergency release due to outage."
      })
    ).resolves.toBeTruthy();
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.version.transition.override" })
    );
  });
});


it("soft-deletes regulated document without hard delete", async () => {
  mocks.generatedFindFirst.mockResolvedValueOnce({
    id: "d1",
    deletedAt: null,
    status: "IN_REVIEW"
  });
  mocks.generatedUpdate.mockResolvedValueOnce({
    id: "d1",
    deletedAt: new Date("2026-02-19T00:00:00.000Z"),
    status: "REJECTED"
  });

  await softDeleteRegulatedDocument({
    organizationId: "org1",
    documentId: "d1",
    actorUserId: "u1",
    reason: "Correction superseded by new approved version"
  });

  expect(mocks.generatedUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "d1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) })
  );
  expect(mocks.generatedDelete).not.toHaveBeenCalled();
  expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "document.soft_delete" }));
});

it("returns version history with signatures", async () => {
  mocks.versionFindMany.mockResolvedValueOnce([
    {
      id: "v2",
      versionNumber: 2,
      state: "APPROVED",
      changeReason: "Correction applied",
      changeComment: "Correction",
      contentHash: "hash-v2",
      createdAt: new Date("2026-02-19T00:00:00.000Z"),
      editedBy: { id: "u1", fullName: "Andrew", email: "andrew@qa.org" }
    }
  ]);
  mocks.signatureFindMany.mockResolvedValueOnce([
    {
      id: "sig1",
      recordVersionId: "v2",
      signerUserId: "u2",
      signerFullName: "Reviewer",
      meaning: "APPROVE",
      signedAt: new Date("2026-02-19T01:00:00.000Z"),
      remarks: null,
      signatureManifest: "abc"
    }
  ]);

  const history = await listDocumentVersionHistory({ organizationId: "org1", documentId: "d1" });
  expect(history[0].changeReason).toBe("Correction applied");
  expect(history[0].signatures[0].id).toBe("sig1");
});
