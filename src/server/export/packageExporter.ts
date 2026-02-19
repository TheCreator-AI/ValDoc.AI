import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
import { ZipFile } from "yazl";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { prisma } from "@/server/db/prisma";
import { buildDocxExportModel, renderDefaultDocx, type SignatureRow } from "@/server/export/defaultDocxRenderer";
import { ensureStoragePathIsSafe } from "@/server/files/storage";

const outputDir = path.resolve(process.cwd(), "storage", "exports");

const ensureOutputDir = () => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
};

const toSafeName = (input: string) => input.replace(/[^a-zA-Z0-9-_]/g, "_");

const parsePayload = (content: string) => {
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
};

const buildComplianceAppendixLines = (model: ReturnType<typeof buildDocxExportModel>) => {
  const lines: string[] = [];
  lines.push("Compliance Appendix");
  lines.push("");
  lines.push("Document Metadata");
  for (const row of model.metadataRows) {
    lines.push(`${row.key}: ${row.value}`);
  }
  lines.push("");
  lines.push("Traceability References");
  if (model.traceabilityRows.length === 0) {
    lines.push("No traceability rows.");
  } else {
    for (const row of model.traceabilityRows) {
      lines.push(`${row.requirementId} -> ${row.riskControlId} -> ${row.testCaseId}`);
    }
  }
  lines.push("");
  lines.push(model.footerText);
  return lines;
};

const buildSignaturePageLines = (signatures: SignatureRow[]) => {
  const lines: string[] = [];
  lines.push("Signature Page");
  lines.push("");
  if (signatures.length === 0) {
    lines.push("No signatures recorded for this version.");
    return lines;
  }

  for (const signature of signatures) {
    lines.push(`Signer: ${signature.signerFullName}`);
    lines.push(`User ID: ${signature.signerUserId}`);
    lines.push(`Meaning: ${signature.meaning}`);
    lines.push(`Signed At: ${signature.signedAt}`);
    lines.push(`Record Hash: ${signature.recordHash}`);
    lines.push("");
  }
  return lines;
};

export const exportJobAsZip = async (organizationId: string, jobId: string) => {
  ensureOutputDir();
  const job = await prisma.generationJob.findFirstOrThrow({
    where: { id: jobId, organizationId },
    include: {
      documents: {
        include: {
          traceLinks: true
        }
      }
    }
  });

  const zipPath = path.join(outputDir, `${randomUUID()}.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const zip = new ZipFile();

    output.on("close", () => resolve());
    output.on("error", (error) => reject(error));
    zip.outputStream.on("error", (error) => reject(error));
    zip.outputStream.pipe(output);

    for (const document of job.documents) {
      const name = `${document.docType}-${toSafeName(document.title)}.md`;
      zip.addBuffer(Buffer.from(document.currentContent, "utf8"), name);

      if (document.traceLinks.length > 0) {
        const traceCsv = [
          "requirementId,riskControlId,testCaseId,citationSourceId,citationPage",
          ...document.traceLinks.map((link) =>
            `${link.requirementId},${link.riskControlId},${link.testCaseId},${link.citationSourceId ?? ""},${link.citationPage ?? ""}`
          )
        ].join("\n");

        zip.addBuffer(Buffer.from(traceCsv, "utf8"), `${document.docType}-traceability.csv`);
      }
    }

    zip.end();
  });

  return zipPath;
};

export const exportDocumentAsPdf = async (organizationId: string, documentId: string) => {
  return await exportDocumentAsPdfWithMetadata({
    organizationId,
    documentId,
    createdByUserId: undefined
  });
};

export const exportDocumentAsPdfWithMetadata = async (params: {
  organizationId: string;
  documentId: string;
  createdByUserId?: string;
}) => {
  ensureOutputDir();
  const document = await prisma.generatedDocument.findFirstOrThrow({
    where: { id: params.documentId, organizationId: params.organizationId },
    include: {
      generationJob: {
        include: {
          machine: true
        }
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1
      }
    }
  });

  const payload = parsePayload(document.currentContent);
  const docPayload = {
    ...payload,
    metadata: {
      ...(typeof payload.metadata === "object" && payload.metadata ? payload.metadata : {}),
      doc_type: payload?.metadata?.doc_type ?? document.docType,
      doc_version: payload?.metadata?.doc_version ?? "v1",
      system_name: payload?.metadata?.system_name ?? document.generationJob.machine.name,
      equipment_id: payload?.metadata?.equipment_id ?? document.generationJob.machine.modelNumber,
      generated_at: payload?.metadata?.generated_at ?? document.createdAt.toISOString(),
      generated_by: payload?.metadata?.generated_by ?? "system"
    }
  };
  const hash = document.versions[0]?.contentHash ?? createHash("sha256").update(document.currentContent).digest("hex");
  const signatures = await prisma.electronicSignature.findMany({
    where: {
      organizationId: params.organizationId,
      recordType: "GENERATED_DOCUMENT",
      recordId: document.id,
      recordVersionId: document.versions[0]?.id
    },
    orderBy: { signedAt: "asc" }
  });
  const signatureRows: SignatureRow[] = signatures.map((signature) => ({
    signerFullName: signature.signerFullName,
    signerUserId: signature.signerUserId,
    meaning: signature.meaning,
    signedAt: signature.signedAt.toISOString(),
    recordHash: signature.signatureManifest
  }));
  const model = buildDocxExportModel({
    docType: document.docType,
    docId: document.id,
    hash,
    payload: docPayload,
    signatures: signatureRows
  });
  const complianceLines = buildComplianceAppendixLines(model);
  const signatureLines = buildSignaturePageLines(signatureRows);
  const pdfPath = path.join(outputDir, `${randomUUID()}.pdf`);

  await new Promise<void>((resolve, reject) => {
    const pdf = new PDFDocument();
    const stream = fs.createWriteStream(pdfPath);
    pdf.pipe(stream);
    pdf.fontSize(18).text(document.title);
    pdf.moveDown();
    pdf.fontSize(10).text(document.currentContent);
    pdf.addPage();
    pdf.fontSize(12).text("Compliance Appendix");
    pdf.moveDown(0.5);
    pdf.fontSize(9).text(complianceLines.join("\n"));
    pdf.addPage();
    pdf.fontSize(12).text("Signature Page");
    pdf.moveDown(0.5);
    pdf.fontSize(9).text(signatureLines.join("\n"));
    pdf.end();
    stream.on("finish", () => resolve());
    stream.on("error", (error) => reject(error));
  });

  const exportedFileHash = createHash("sha256").update(await fs.promises.readFile(pdfPath)).digest("hex");

  if (params.createdByUserId) {
    await prisma.documentExport.create({
      data: {
        exportId: randomUUID(),
        organizationId: params.organizationId,
        docId: document.id,
        hash: exportedFileHash,
        path: pdfPath,
        format: "pdf",
        createdBy: params.createdByUserId
      }
    });
  }

  return {
    filePath: pdfPath,
    title: document.title
  };
};

export const exportDocumentAsDocx = async (organizationId: string, documentId: string) => {
  const exported = await exportDocumentAsDocxWithMetadata({
    organizationId,
    documentId,
    createdByUserId: undefined
  });
  return exported.filePath;
};

export const exportDocumentAsDocxWithMetadata = async (params: {
  organizationId: string;
  documentId: string;
  createdByUserId?: string;
}) => {
  ensureOutputDir();
  const document = await prisma.generatedDocument.findFirstOrThrow({
    where: { id: params.documentId, organizationId: params.organizationId },
    include: {
      generationJob: {
        include: {
          machine: true
        }
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1
      }
    }
  });

  const payload = parsePayload(document.currentContent);
  const docPayload = {
    ...payload,
    metadata: {
      ...(typeof payload.metadata === "object" && payload.metadata ? payload.metadata : {}),
      doc_type: payload?.metadata?.doc_type ?? document.docType,
      doc_version: payload?.metadata?.doc_version ?? "v1",
      system_name: payload?.metadata?.system_name ?? document.generationJob.machine.name,
      equipment_id: payload?.metadata?.equipment_id ?? document.generationJob.machine.modelNumber,
      generated_at: payload?.metadata?.generated_at ?? document.createdAt.toISOString(),
      generated_by: payload?.metadata?.generated_by ?? "system"
    }
  };
  const hash = document.versions[0]?.contentHash ?? createHash("sha256").update(document.currentContent).digest("hex");
  const signatures = await prisma.electronicSignature.findMany({
    where: {
      organizationId: params.organizationId,
      recordType: "GENERATED_DOCUMENT",
      recordId: document.id,
      recordVersionId: document.versions[0]?.id
    },
    orderBy: { signedAt: "asc" }
  });
  const signatureRows: SignatureRow[] = signatures.map((signature) => ({
    signerFullName: signature.signerFullName,
    signerUserId: signature.signerUserId,
    meaning: signature.meaning,
    signedAt: signature.signedAt.toISOString(),
    recordHash: signature.signatureManifest
  }));
  const rendered = await renderDefaultDocx({
    docType: document.docType,
    title: document.title,
    docId: document.id,
    hash,
    payload: docPayload,
    signatures: signatureRows,
    primaryContent: document.currentContent
  });
  const docxPath = path.join(outputDir, `${randomUUID()}.docx`);
  await fs.promises.writeFile(docxPath, rendered.buffer);
  const exportedFileHash = createHash("sha256").update(rendered.buffer).digest("hex");

  if (params.createdByUserId) {
    await prisma.documentExport.create({
      data: {
        exportId: randomUUID(),
        organizationId: params.organizationId,
        docId: document.id,
        hash: exportedFileHash,
        path: docxPath,
        format: "docx",
        createdBy: params.createdByUserId
      }
    });
  }

  return {
    filePath: docxPath,
    title: document.title
  };
};

export const fileToResponse = async (filePath: string, contentType: string, downloadName?: string) => {
  ensureStoragePathIsSafe(filePath);
  const stat = await fs.promises.stat(filePath);
  const stream = fs.createReadStream(filePath);
  const responseFileName = downloadName ? `${toSafeName(downloadName)}${path.extname(filePath)}` : path.basename(filePath);

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${responseFileName}"`,
      "X-Content-Type-Options": "nosniff"
    }
  });
};
