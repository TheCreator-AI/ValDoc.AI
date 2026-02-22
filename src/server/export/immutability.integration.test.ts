/** @vitest-environment node */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { runWithOrgContext, runWithoutOrgScope } from "@/server/db/org-scope-context";

describe("document export immutability", () => {
  it("blocks update and delete operations for stored exports", async () => {
    const organizationId = `org_export_${randomUUID()}`;
    const userId = `user_export_${randomUUID()}`;
    const machineId = `machine_export_${randomUUID()}`;
    const jobId = `job_export_${randomUUID()}`;
    const documentId = `doc_export_${randomUUID()}`;
    const exportId = `exp_${randomUUID()}`;
    const exportRecordId = `exp_rec_${randomUUID()}`;

    await runWithoutOrgScope(async () => {
      await prisma.organization.create({
        data: { id: organizationId, name: `Export Org ${organizationId}`, isActive: true }
      });
      await prisma.user.create({
        data: {
          id: userId,
          organizationId,
          email: `${userId}@example.test`,
          passwordHash: "hash",
          fullName: "Export Test User",
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
      await prisma.documentExport.create({
        data: {
          id: exportRecordId,
          exportId,
          organizationId,
          docId: documentId,
          hash: "abc",
          path: "storage/exports/immutable-test.docx",
          format: "docx",
          createdBy: userId
        }
      });
    });

    await expect(
      runWithOrgContext(organizationId, () =>
        prisma.documentExport.update({
          where: { id: exportRecordId },
          data: { hash: "def" }
        })
      )
    ).rejects.toThrow(/immutable/i);

    await expect(
      runWithOrgContext(organizationId, () =>
        prisma.documentExport.delete({
          where: { id: exportRecordId }
        })
      )
    ).rejects.toThrow(/immutable/i);
  });
});

