import { describe, expect, it } from "vitest";
import { buildRetentionPurgePlan } from "@/server/retention/service";

describe("retention purge planning", () => {
  it("excludes legal-hold records from purge candidates", () => {
    const now = new Date("2026-02-18T12:00:00.000Z");
    const old = new Date("2025-01-01T00:00:00.000Z");

    const plan = buildRetentionPurgePlan({
      now,
      policy: {
        auditEventRetentionDays: 30,
        documentVersionRetentionDays: 30
      },
      generatedDocuments: [
        { id: "doc-a", createdAt: old, deletedAt: null },
        { id: "doc-b", createdAt: old, deletedAt: null }
      ],
      documentVersions: [
        { id: "ver-a", generatedDocumentId: "doc-a", createdAt: old, deletedAt: null },
        { id: "ver-b", generatedDocumentId: "doc-b", createdAt: old, deletedAt: null },
        { id: "ver-c", generatedDocumentId: "doc-b", createdAt: old, deletedAt: null }
      ],
      auditEvents: [{ id: "audit-a", timestamp: old }],
      legalHolds: [
        { recordType: "GENERATED_DOCUMENT", recordId: "doc-a", recordVersionId: null, isActive: true },
        { recordType: "DOCUMENT_VERSION", recordId: "doc-b", recordVersionId: "ver-b", isActive: true }
      ]
    });

    expect(plan.generatedDocuments.toDeleteIds).toEqual(["doc-b"]);
    expect(plan.generatedDocuments.blockedByHoldIds).toEqual(["doc-a"]);
    expect(plan.documentVersions.toDeleteIds).toEqual(["ver-c"]);
    expect(plan.documentVersions.blockedByHoldIds).toEqual(["ver-a", "ver-b"]);
    expect(plan.auditEvents.toDeleteIds).toEqual([]);
    expect(plan.auditEvents.blockedReason).toContain("append-only");
  });

  it("treats null retention as indefinite and purges nothing", () => {
    const old = new Date("2025-01-01T00:00:00.000Z");
    const plan = buildRetentionPurgePlan({
      now: new Date("2026-02-18T12:00:00.000Z"),
      policy: {
        auditEventRetentionDays: null,
        documentVersionRetentionDays: null
      },
      generatedDocuments: [{ id: "doc-a", createdAt: old, deletedAt: null }],
      documentVersions: [{ id: "ver-a", generatedDocumentId: "doc-a", createdAt: old, deletedAt: null }],
      auditEvents: [{ id: "audit-a", timestamp: old }],
      legalHolds: []
    });

    expect(plan.generatedDocuments.toDeleteIds).toEqual([]);
    expect(plan.documentVersions.toDeleteIds).toEqual([]);
    expect(plan.auditEvents.toDeleteIds).toEqual([]);
  });
});
