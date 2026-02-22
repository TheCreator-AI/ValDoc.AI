/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/http";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  getSessionOrThrowWithPermission: vi.fn(),
  machineFindMany: vi.fn(),
  generationJobFindMany: vi.fn(),
  generationJobFindFirst: vi.fn(),
  machineFindFirst: vi.fn(),
  generatedDocumentFindFirst: vi.fn(),
  generatedDocumentFindMany: vi.fn(),
  traceabilityFindMany: vi.fn(),
  changeControlFindMany: vi.fn(),
  changeControlFindFirstOrThrow: vi.fn(),
  changeControlUpdate: vi.fn(),
  labGroupFindMany: vi.fn(),
  saveDocumentVersion: vi.fn(),
  setReviewDecision: vi.fn(),
  createDocumentVersion: vi.fn(),
  listDocumentVersionHistory: vi.fn(),
  transitionDocumentVersionState: vi.fn(),
  userFindFirst: vi.fn(),
  documentVersionFindFirst: vi.fn(),
  exportJobAsZip: vi.fn(),
  exportDocumentAsDocxWithMetadata: vi.fn(),
  exportDocumentAsPdfWithMetadata: vi.fn(),
  fileToResponse: vi.fn(),
  evaluateDocumentQualityGate: vi.fn(),
  generateValidationPackage: vi.fn(),
  generateIoqDocument: vi.fn(),
  generateOqDocument: vi.fn(),
  generateTraceabilityMatrix: vi.fn(),
  generateRaPayloadFromUrs: vi.fn(),
  hashRaPayload: vi.fn(),
  parseUrsRequirementsFromContent: vi.fn(),
  writeAuditEvent: vi.fn(),
  auditEventFindMany: vi.fn(),
  auditChainHeadFindUnique: vi.fn(),
  searchChunks: vi.fn()
}));

vi.mock("bcryptjs", () => ({
  compare: vi.fn().mockResolvedValue(true)
}));

vi.mock("@/server/api/http", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/http")>("@/server/api/http");
  return {
    ...actual,
    getSessionOrThrow: mocks.getSessionOrThrow,
    getSessionOrThrowWithPermission: mocks.getSessionOrThrowWithPermission
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    machine: {
      findMany: mocks.machineFindMany,
      findFirst: mocks.machineFindFirst
    },
    generationJob: {
      findMany: mocks.generationJobFindMany,
      findFirst: mocks.generationJobFindFirst
    },
    generatedDocument: {
      findFirst: mocks.generatedDocumentFindFirst,
      findMany: mocks.generatedDocumentFindMany
    },
    user: {
      findFirst: mocks.userFindFirst
    },
    documentVersion: {
      findFirst: mocks.documentVersionFindFirst
    },
    traceabilityLink: {
      findMany: mocks.traceabilityFindMany
    },
    changeControl: {
      findMany: mocks.changeControlFindMany,
      findFirstOrThrow: mocks.changeControlFindFirstOrThrow,
      update: mocks.changeControlUpdate
    },
    labGroup: {
      findMany: mocks.labGroupFindMany
    },
    auditEvent: {
      findMany: mocks.auditEventFindMany
    },
    auditChainHead: {
      findUnique: mocks.auditChainHeadFindUnique
    }
  }
}));

vi.mock("@/server/workflow/review", () => ({
  saveDocumentVersion: mocks.saveDocumentVersion,
  setReviewDecision: mocks.setReviewDecision
}));

vi.mock("@/server/documents/lifecycle", () => ({
  createDocumentVersion: mocks.createDocumentVersion,
  listDocumentVersionHistory: mocks.listDocumentVersionHistory,
  transitionDocumentVersionState: mocks.transitionDocumentVersionState
}));

vi.mock("@/server/export/packageExporter", () => ({
  exportJobAsZip: mocks.exportJobAsZip,
  exportDocumentAsDocxWithMetadata: mocks.exportDocumentAsDocxWithMetadata,
  exportDocumentAsPdfWithMetadata: mocks.exportDocumentAsPdfWithMetadata,
  fileToResponse: mocks.fileToResponse
}));

vi.mock("@/server/quality/documentQualityGate", () => ({
  evaluateDocumentQualityGate: mocks.evaluateDocumentQualityGate,
  QualityGateFailureError: class QualityGateFailureError extends Error {
    issues: string[];
    constructor(message: string, issues: string[] = []) {
      super(message);
      this.issues = issues;
    }
  }
}));

vi.mock("@/server/generation/generateDocuments", () => ({
  generateValidationPackage: mocks.generateValidationPackage
}));

vi.mock("@/server/generation/ioqGenerator", () => ({
  generateIoqDocument: mocks.generateIoqDocument
}));

vi.mock("@/server/generation/oqGenerator", () => ({
  generateOqDocument: mocks.generateOqDocument
}));

vi.mock("@/server/generation/traceabilityGenerator", () => ({
  generateTraceabilityMatrix: mocks.generateTraceabilityMatrix
}));

vi.mock("@/server/risk/generator", () => ({
  generateRaPayloadFromUrs: mocks.generateRaPayloadFromUrs,
  hashRaPayload: mocks.hashRaPayload,
  parseUrsRequirementsFromContent: mocks.parseUrsRequirementsFromContent
}));

vi.mock("@/server/audit/events", () => ({
  writeAuditEvent: mocks.writeAuditEvent
}));

vi.mock("@/server/search/indexer", () => ({
  searchChunks: mocks.searchChunks
}));

import { GET as machinesGet } from "@/app/api/machines/route";
import { GET as jobsGet } from "@/app/api/jobs/route";
import { POST as generationStartPost } from "@/app/api/generation/start/route";
import { GET as generationByIdGet } from "@/app/api/generation/[jobId]/route";
import { POST as ioqPost } from "@/app/api/equipment/[id]/generate/ioq/route";
import { POST as oqPost } from "@/app/api/equipment/[id]/generate/oq/route";
import { POST as tracePost } from "@/app/api/equipment/[id]/generate/trace/route";
import { POST as ursToRaPost } from "@/app/api/urs/[id]/generate/ra/route";
import { GET as changeControlsGet } from "@/app/api/change-controls/route";
import { GET as labGroupsGet } from "@/app/api/lab-groups/route";
import { POST as changeControlApprovePost } from "@/app/api/change-controls/[changeControlId]/approve/route";
import { POST as reviewVersionPost } from "@/app/api/review/[documentId]/version/route";
import { POST as reviewDecisionPost } from "@/app/api/review/[documentId]/decision/route";
import { GET as documentVersionsGet, POST as documentVersionsPost } from "@/app/api/documents/[id]/versions/route";
import { POST as transitionPost } from "@/app/api/documents/[id]/versions/[versionId]/transition/route";
import { POST as signaturePost } from "@/app/api/records/[type]/[id]/versions/[versionId]/sign/route";
import { GET as exportGet } from "@/app/api/export/[jobId]/route";
import { GET as auditVerifyGet } from "@/app/api/admin/audit/verify-chain/route";
import { GET as searchGet } from "@/app/api/search/route";

describe("cross-organization route-group coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      userId: "user_a",
      organizationId: "org_a",
      role: "ADMIN",
      email: "admin@orga.test"
    });
    mocks.getSessionOrThrowWithPermission.mockResolvedValue({
      userId: "user_a",
      organizationId: "org_a",
      role: "ADMIN",
      email: "admin@orga.test"
    });
    mocks.fileToResponse.mockResolvedValue(new Response("file", { status: 200 }));
    mocks.evaluateDocumentQualityGate.mockReturnValue({ ready: true, issues: [] });
    mocks.auditChainHeadFindUnique.mockResolvedValue({ headHash: "" });
    mocks.generatedDocumentFindMany.mockResolvedValue([]);
    mocks.traceabilityFindMany.mockResolvedValue([]);
    mocks.searchChunks.mockResolvedValue([]);
  });

  it("does not leak cross-org objects on list endpoints", async () => {
    mocks.machineFindMany.mockResolvedValue([{ id: "machine_a" }]);
    mocks.generationJobFindMany.mockResolvedValue([{ id: "job_a" }]);
    mocks.changeControlFindMany.mockResolvedValue([{ id: "cc_a" }]);
    mocks.labGroupFindMany.mockResolvedValue([{ id: "lab_a" }]);

    await machinesGet();
    await jobsGet();
    await changeControlsGet();
    await labGroupsGet();

    expect(mocks.machineFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org_a" } }));
    expect(mocks.generationJobFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org_a" } }));
    expect(mocks.changeControlFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org_a" } }));
    expect(mocks.labGroupFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org_a" } }));
  });

  it("returns 404 for cross-org generation and review operations", async () => {
    mocks.machineFindFirst.mockResolvedValue(null);
    mocks.generationJobFindFirst.mockResolvedValue(null);
    mocks.saveDocumentVersion.mockRejectedValue(new ApiError(404, "Document not found."));
    mocks.setReviewDecision.mockRejectedValue(new ApiError(404, "Document not found."));

    const startResponse = await generationStartPost(
      new Request("http://localhost/api/generation/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ machineId: "machine_b" })
      })
    );
    const byIdResponse = await generationByIdGet(new Request("http://localhost/api/generation/job_b"), {
      params: Promise.resolve({ jobId: "job_b" })
    });
    const reviewVersionResponse = await reviewVersionPost(
      new Request("http://localhost/api/review/doc_b/version", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "updated" })
      }),
      { params: Promise.resolve({ documentId: "doc_b" }) }
    );
    const reviewDecisionResponse = await reviewDecisionPost(
      new Request("http://localhost/api/review/doc_b/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "APPROVED" })
      }),
      { params: Promise.resolve({ documentId: "doc_b" }) }
    );

    expect(startResponse.status).toBe(404);
    expect(byIdResponse.status).toBe(404);
    expect(reviewVersionResponse.status).toBe(404);
    expect(reviewDecisionResponse.status).toBe(404);
  });

  it("returns 404 for cross-org version lifecycle operations", async () => {
    mocks.listDocumentVersionHistory.mockRejectedValue(new ApiError(404, "Document not found."));
    mocks.createDocumentVersion.mockRejectedValue(new ApiError(404, "Document not found."));
    mocks.transitionDocumentVersionState.mockRejectedValue(new ApiError(404, "Document not found."));

    const listResponse = await documentVersionsGet(new Request("http://localhost/api/documents/doc_b/versions"), {
      params: Promise.resolve({ id: "doc_b" })
    });
    const createResponse = await documentVersionsPost(
      new Request("http://localhost/api/documents/doc_b/versions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ change_reason: "x" })
      }),
      { params: Promise.resolve({ id: "doc_b" }) }
    );
    const transitionResponse = await transitionPost(
      new Request("http://localhost/api/documents/doc_b/versions/v2/transition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to_state: "IN_REVIEW" })
      }),
      { params: Promise.resolve({ id: "doc_b", versionId: "v2" }) }
    );

    expect(listResponse.status).toBe(404);
    expect(createResponse.status).toBe(404);
    expect(transitionResponse.status).toBe(404);
  });

  it("returns 404 for cross-org signature operation", async () => {
    mocks.userFindFirst.mockResolvedValue({
      id: "user_a",
      fullName: "Org A User",
      passwordHash: "hash",
      mfaEnabled: false
    });
    mocks.documentVersionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "v2", versionNumber: 2 });

    const response = await signaturePost(
      new Request("http://localhost/api/records/generated-document/doc_b/versions/v2/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meaning: "REVIEW", password: "Password123!", remarks: "Review attempt" })
      }),
      { params: Promise.resolve({ type: "generated-document", id: "doc_b", versionId: "v2" }) }
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 for cross-org deterministic document generation endpoints", async () => {
    mocks.generateIoqDocument.mockRejectedValue(new ApiError(404, "Equipment not found."));
    mocks.generateOqDocument.mockRejectedValue(new ApiError(404, "Equipment not found."));
    mocks.generateTraceabilityMatrix.mockRejectedValue(new ApiError(404, "Equipment not found."));
    mocks.generatedDocumentFindFirst.mockResolvedValue(null);

    const ioqResponse = await ioqPost(new Request("http://localhost/api/equipment/machine_b/generate/ioq", { method: "POST" }), {
      params: Promise.resolve({ id: "machine_b" })
    });
    const oqResponse = await oqPost(new Request("http://localhost/api/equipment/machine_b/generate/oq", { method: "POST" }), {
      params: Promise.resolve({ id: "machine_b" })
    });
    const traceResponse = await tracePost(
      new Request("http://localhost/api/equipment/machine_b/generate/trace", { method: "POST" }),
      { params: Promise.resolve({ id: "machine_b" }) }
    );
    const raResponse = await ursToRaPost(new Request("http://localhost/api/urs/doc_b/generate/ra", { method: "POST" }), {
      params: Promise.resolve({ id: "doc_b" })
    });

    expect(ioqResponse.status).toBe(404);
    expect(oqResponse.status).toBe(404);
    expect(traceResponse.status).toBe(404);
    expect(raResponse.status).toBe(404);
  });

  it("returns 404 for cross-org export and change-control approve endpoints", async () => {
    mocks.exportJobAsZip.mockRejectedValue(new ApiError(404, "Generation job not found."));
    mocks.exportDocumentAsDocxWithMetadata.mockRejectedValue(new ApiError(404, "Document not found."));
    mocks.exportDocumentAsPdfWithMetadata.mockRejectedValue(new ApiError(404, "Document not found."));
    mocks.changeControlFindFirstOrThrow.mockRejectedValue(new ApiError(404, "Change control not found."));

    const zipResponse = await exportGet(new Request("http://localhost/api/export/job_b?format=zip"), {
      params: Promise.resolve({ jobId: "job_b" })
    });
    const docxResponse = await exportGet(new Request("http://localhost/api/export/job_b?format=docx&documentId=doc_b"), {
      params: Promise.resolve({ jobId: "job_b" })
    });
    const pdfResponse = await exportGet(new Request("http://localhost/api/export/job_b?format=pdf&documentId=doc_b"), {
      params: Promise.resolve({ jobId: "job_b" })
    });
    const approveResponse = await changeControlApprovePost(
      new Request("http://localhost/api/change-controls/cc_b/approve", { method: "POST" }),
      { params: Promise.resolve({ changeControlId: "cc_b" }) }
    );

    expect(zipResponse.status).toBe(404);
    expect(docxResponse.status).toBe(404);
    expect(pdfResponse.status).toBe(404);
    expect(approveResponse.status).toBe(404);
  });

  it("uses organization-scoped audit query for verify-chain endpoint", async () => {
    mocks.auditEventFindMany.mockResolvedValue([]);

    const response = await auditVerifyGet(new Request("http://localhost/api/admin/audit/verify-chain"));
    expect(response.status).toBe(200);
    expect(mocks.auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org_a" } })
    );
  });

  it("uses organization-scoped search queries", async () => {
    const response = await searchGet(new Request("http://localhost/api/search?q=temperature"));
    expect(response.status).toBe(200);
    expect(mocks.searchChunks).toHaveBeenCalledWith("org_a", "temperature");
  });
});
