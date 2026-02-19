import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  versionFindFirst: vi.fn(),
  versionCreate: vi.fn(),
  versionUpdate: vi.fn(),
  generatedUpdate: vi.fn(),
  writeAuditEvent: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    documentVersion: {
      findFirst: mocks.versionFindFirst,
      create: mocks.versionCreate,
      update: mocks.versionUpdate
    },
    generatedDocument: {
      update: mocks.generatedUpdate
    }
  }
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

import { createDocumentVersion, transitionDocumentVersionState } from "@/server/documents/lifecycle";

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
    mocks.generatedUpdate.mockResolvedValue({});
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
