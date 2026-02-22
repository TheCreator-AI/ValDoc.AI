/** @vitest-environment node */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { runWithOrgContext, runWithoutOrgScope } from "@/server/db/org-scope-context";
import { hashRecordContent } from "@/server/signatures/manifest";
import { verifyElectronicSignatureBinding } from "@/server/signatures/verify";

describe("signature binding and approved immutability", () => {
  it("keeps signature valid and blocks post-approval content mutation", async () => {
    const organizationId = `org_sig_${randomUUID()}`;
    const userId = `user_sig_${randomUUID()}`;
    const machineId = `machine_sig_${randomUUID()}`;
    const jobId = `job_sig_${randomUUID()}`;
    const documentId = `doc_sig_${randomUUID()}`;
    const versionId = `ver_sig_${randomUUID()}`;
    const signatureId = `sig_${randomUUID()}`;
    const content = "{\"requirements\":[{\"req_id\":\"URS-001\",\"statement\":\"System shall work\"}]}";
    const manifest = hashRecordContent(content);

    await runWithoutOrgScope(async () => {
      await prisma.organization.create({
        data: { id: organizationId, name: `Sig Org ${organizationId}`, isActive: true }
      });
      await prisma.user.create({
        data: {
          id: userId,
          organizationId,
          email: `${userId}@example.test`,
          passwordHash: "hash",
          fullName: "Signature Test User",
          role: "APPROVER"
        }
      });
      await prisma.machine.create({
        data: {
          id: machineId,
          organizationId,
          name: "Machine",
          modelNumber: "M-1",
          manufacturer: "ValDoc"
        }
      });
      await prisma.generationJob.create({
        data: {
          id: jobId,
          organizationId,
          machineId,
          createdByUserId: userId,
          status: "COMPLETE"
        }
      });
      await prisma.generatedDocument.create({
        data: {
          id: documentId,
          organizationId,
          generationJobId: jobId,
          docType: "URS",
          stage: "PRE_EXECUTION",
          title: "URS",
          status: "APPROVED",
          currentContent: content
        }
      });
      await prisma.documentVersion.create({
        data: {
          id: versionId,
          generatedDocumentId: documentId,
          editedByUserId: userId,
          versionNumber: 1,
          state: "APPROVED",
          contentSnapshot: content,
          contentHash: manifest,
          signatureManifest: manifest
        }
      });
      await prisma.electronicSignature.create({
        data: {
          id: signatureId,
          organizationId,
          recordType: "GENERATED_DOCUMENT",
          recordId: documentId,
          recordVersionId: versionId,
          signerUserId: userId,
          signerFullName: "Signature Test User",
          meaning: "APPROVE",
          authMethod: "PASSWORD_REAUTH",
          signatureManifest: manifest,
          remarks: "Approval complete"
        }
      });
    });

    const before = await runWithOrgContext(organizationId, () =>
      verifyElectronicSignatureBinding({ organizationId, signatureId })
    );
    expect(before.valid).toBe(true);

    await expect(
      runWithOrgContext(organizationId, () =>
        prisma.documentVersion.update({
          where: { id: versionId },
          data: { contentSnapshot: "{\"requirements\":[]}" }
        })
      )
    ).rejects.toThrow(/immutable/i);

    const after = await runWithOrgContext(organizationId, () =>
      verifyElectronicSignatureBinding({ organizationId, signatureId })
    );
    expect(after.valid).toBe(true);
  });
});

