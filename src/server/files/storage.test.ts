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
  });
});
