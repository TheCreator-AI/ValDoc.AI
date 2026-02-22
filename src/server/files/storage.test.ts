import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { saveUploadedFile } from "./storage";

const makePdfFile = (name: string) => {
  const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "utf8");
  return {
    name,
    size: bytes.length,
    type: "application/pdf",
    arrayBuffer: async () => bytes
  } as unknown as File;
};

const buildZipBuffer = (entries: Array<{ name: string; data: Buffer }>) => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBytes, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localBody = Buffer.concat(localParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localBody.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBody, centralDirectory, eocd]);
};

describe("secure storage", () => {
  it("rejects disallowed filename extensions", async () => {
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "utf8");
    const disguised = {
      name: "manual.exe",
      size: bytes.length,
      type: "application/pdf",
      arrayBuffer: async () => bytes
    } as unknown as File;
    await expect(saveUploadedFile(disguised, { kind: "SOURCE_DOCUMENT" })).rejects.toMatchObject({
      status: 400
    });
  });

  it("rejects spoofed content types", async () => {
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "utf8");
    const spoofed = {
      name: "manual.pdf",
      size: bytes.length,
      type: "text/plain",
      arrayBuffer: async () => bytes
    } as unknown as File;
    await expect(saveUploadedFile(spoofed, { kind: "SOURCE_DOCUMENT" })).rejects.toMatchObject({
      status: 400
    });
  });

  it("rejects forbidden file signatures", async () => {
    const raw = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const png = {
      name: "image.png",
      size: raw.length,
      type: "image/png",
      arrayBuffer: async () => raw
    } as unknown as File;
    await expect(saveUploadedFile(png, { kind: "TEMPLATE" })).rejects.toMatchObject({
      status: 400
    });
  });

  it("rejects oversized uploads", async () => {
    const raw = Buffer.alloc(26 * 1024 * 1024, 0x41);
    const oversize = {
      name: "huge.pdf",
      size: raw.length,
      type: "application/pdf",
      arrayBuffer: async () => raw
    } as unknown as File;
    await expect(saveUploadedFile(oversize, { kind: "SOURCE_DOCUMENT" })).rejects.toMatchObject({
      status: 413
    });
  });

  it("prevents path traversal in stored file paths and names", async () => {
    const stored = await saveUploadedFile(makePdfFile("..\\..\\evil.pdf"), { kind: "SOURCE_DOCUMENT" });
    expect(path.basename(stored.filePath)).toMatch(/^[a-f0-9-]+\.pdf$/);
    expect(stored.fileName).toBe("evil.pdf");
    expect(stored.filePath).not.toContain("..");
    await fs.promises.unlink(stored.filePath);
  });

  it("rejects files flagged by malware scan hook", async () => {
    const file = makePdfFile("manual.pdf");
    await expect(
      saveUploadedFile(file, {
        kind: "SOURCE_DOCUMENT",
        scanner: async () => ({ clean: false, reason: "malware.signature.test" })
      })
    ).rejects.toMatchObject({ status: 400 });

    const quarantinePath = path.resolve(process.cwd(), "storage", "quarantine");
    const entries = await fs.promises.readdir(quarantinePath);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("rejects PDF files that exceed max page count", async () => {
    const oversizedPdf = `%PDF-1.7\n${"/Type /Page\n".repeat(1101)}`;
    const raw = Buffer.from(oversizedPdf, "utf8");
    const file = {
      name: "too-many-pages.pdf",
      size: raw.length,
      type: "application/pdf",
      arrayBuffer: async () => raw
    } as unknown as File;
    await expect(saveUploadedFile(file, { kind: "SOURCE_DOCUMENT" })).rejects.toMatchObject({
      status: 413
    });
  });

  it("rejects DOCX archives containing nested archives", async () => {
    const raw = buildZipBuffer([
      { name: "[Content_Types].xml", data: Buffer.from("<Types/>", "utf8") },
      { name: "word/document.xml", data: Buffer.from("<w:document/>", "utf8") },
      { name: "word/embedded.zip", data: Buffer.from("x", "utf8") }
    ]);
    const file = {
      name: "template.docx",
      size: raw.length,
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      arrayBuffer: async () => raw
    } as unknown as File;
    await expect(saveUploadedFile(file, { kind: "TEMPLATE" })).rejects.toMatchObject({
      status: 400
    });
  });
});
