/** @vitest-environment node */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { runWithOrgContext, runWithoutOrgScope } from "@/server/db/org-scope-context";

describe("approved document version immutability", () => {
  it("blocks content snapshot edits once version is approved", async () => {
    const organizationId = `org_doc_${randomUUID()}`;
    const userId = `user_doc_${randomUUID()}`;
    const machineId = `machine_doc_${randomUUID()}`;
    const jobId = `job_doc_${randomUUID()}`;
    const documentId = `doc_${randomUUID()}`;
    const versionId = `ver_${randomUUID()}`;

    await runWithoutOrgScope(async () => {
      await prisma.organization.create({
        data: { id: organizationId, name: `Doc Org ${organizationId}`, isActive: true }
      });
      await prisma.user.create({
        data: {
          id: userId,
          organizationId,
          email: `${userId}@example.test`,
          passwordHash: "hash",
          fullName: "Doc Test User",
          role: "ADMIN"
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
          currentContent: "{\"requirements\":[]}"
        }
      });
      await prisma.documentVersion.create({
        data: {
          id: versionId,
          generatedDocumentId: documentId,
          editedByUserId: userId,
          versionNumber: 1,
          state: "APPROVED",
          contentSnapshot: "{\"requirements\":[{\"req_id\":\"URS-001\"}]}"
        }
      });
    });

    await expect(
      runWithOrgContext(organizationId, () =>
        prisma.documentVersion.update({
          where: { id: versionId },
          data: { contentSnapshot: "{\"requirements\":[{\"req_id\":\"URS-002\"}]}" }
        })
      )
    ).rejects.toThrow(/immutable/i);
  });
});

