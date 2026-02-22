import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/server/api/http";
import { scanUploadedBuffer, type MalwareScanner, type UploadKind } from "@/server/files/malwareScan";

const storageRoot = path.resolve(process.cwd(), "storage");
const uploadsDir = path.join(storageRoot, "uploads");
const quarantineDir = path.join(storageRoot, "quarantine");

const limitsByKind: Record<UploadKind, number> = {
  SOURCE_DOCUMENT: 25 * 1024 * 1024,
  TEMPLATE: 25 * 1024 * 1024,
  EXECUTED_DOCUMENT: 50 * 1024 * 1024,
  VENDOR_DOCUMENT: 50 * 1024 * 1024
};

const maxPdfPagesByKind: Record<UploadKind, number> = {
  SOURCE_DOCUMENT: 1000,
  TEMPLATE: 1000,
  EXECUTED_DOCUMENT: 2000,
  VENDOR_DOCUMENT: 2000
};

const zipSecurityLimits = {
  maxEntries: 1500,
  maxNestedArchiveEntries: 0,
  maxTotalUncompressedBytes: 250 * 1024 * 1024,
  maxEntryUncompressedBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 100
} as const;

const ensureUploadsDir = async () => {
  await fs.promises.mkdir(uploadsDir, { recursive: true });
};

const ensureQuarantineDir = async () => {
  await fs.promises.mkdir(quarantineDir, { recursive: true });
};

const sanitizeDisplayName = (value: string) => {
  const trimmed = value.trim();
  const base = path.basename(trimmed);
  const safe = base.replace(/[^\w.\- ]/g, "_").replace(/\s+/g, " ").slice(0, 180);
  return safe || "upload";
};

const allowedExtensionsByKind: Record<UploadKind, Set<string>> = {
  SOURCE_DOCUMENT: new Set([".pdf", ".doc", ".docx", ".txt"]),
  TEMPLATE: new Set([".pdf", ".doc", ".docx", ".txt"]),
  EXECUTED_DOCUMENT: new Set([".pdf", ".doc", ".docx", ".txt"]),
  VENDOR_DOCUMENT: new Set([".pdf", ".doc", ".docx", ".txt"])
};

const matchesSignature = (buffer: Buffer, signature: number[]) => {
  if (buffer.length < signature.length) return false;
  return signature.every((value, index) => buffer[index] === value);
};

const isLikelyUtf8Text = (buffer: Buffer) => {
  if (buffer.length === 0) return false;
  if (buffer.includes(0x00)) return false;

  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const sample = decoder.decode(buffer.subarray(0, Math.min(buffer.length, 65536)));
    return !/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(sample);
  } catch {
    return false;
  }
};

const countPdfPages = (buffer: Buffer) => {
  const text = buffer.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length ?? 0;
};

type ZipCentralEntry = {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
};

const parseZipCentralDirectory = (buffer: Buffer): ZipCentralEntry[] => {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 66000);
  for (let i = buffer.length - 22; i >= minOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new ApiError(400, "Invalid DOCX archive: missing zip directory.");
  }

  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const end = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryOffset < 0 || end > buffer.length) {
    throw new ApiError(400, "Invalid DOCX archive: invalid central directory bounds.");
  }

  const entries: ZipCentralEntry[] = [];
  let cursor = centralDirectoryOffset;
  while (cursor + 46 <= end) {
    const signature = buffer.readUInt32LE(cursor);
    if (signature !== 0x02014b50) {
      break;
    }
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const headerSize = 46 + fileNameLength + extraLength + commentLength;
    if (cursor + headerSize > end) {
      throw new ApiError(400, "Invalid DOCX archive: malformed central directory entry.");
    }
    const fileName = buffer.toString("utf8", cursor + 46, cursor + 46 + fileNameLength);
    entries.push({ fileName, compressedSize, uncompressedSize });
    cursor += headerSize;
  }

  if (entries.length === 0) {
    throw new ApiError(400, "Invalid DOCX archive: no file entries found.");
  }
  return entries;
};

const enforceDocxArchiveLimits = (buffer: Buffer) => {
  const entries = parseZipCentralDirectory(buffer);
  if (entries.length > zipSecurityLimits.maxEntries) {
    throw new ApiError(413, `DOCX archive has too many entries. Limit is ${zipSecurityLimits.maxEntries}.`);
  }

  let totalCompressed = 0;
  let totalUncompressed = 0;
  let nestedArchiveEntries = 0;
  for (const entry of entries) {
    totalCompressed += entry.compressedSize;
    totalUncompressed += entry.uncompressedSize;
    if (entry.uncompressedSize > zipSecurityLimits.maxEntryUncompressedBytes) {
      throw new ApiError(413, "DOCX archive entry is too large.");
    }
    if (/\.(zip|7z|rar|tar|gz|bz2)$/i.test(entry.fileName)) {
      nestedArchiveEntries += 1;
    }
  }

  if (nestedArchiveEntries > zipSecurityLimits.maxNestedArchiveEntries) {
    throw new ApiError(400, "Nested archives are not allowed in DOCX uploads.");
  }
  if (totalUncompressed > zipSecurityLimits.maxTotalUncompressedBytes) {
    throw new ApiError(413, "DOCX archive uncompressed size exceeds safety limits.");
  }
  const denominator = Math.max(totalCompressed, 1);
  const ratio = totalUncompressed / denominator;
  if (ratio > zipSecurityLimits.maxCompressionRatio) {
    throw new ApiError(413, "DOCX archive compression ratio exceeds safety limits.");
  }

  const names = new Set(entries.map((entry) => entry.fileName));
  if (!names.has("[Content_Types].xml") || !Array.from(names).some((name) => name.startsWith("word/"))) {
    throw new ApiError(400, "Invalid DOCX archive contents.");
  }
};

const detectCanonicalType = (buffer: Buffer) => {
  if (matchesSignature(buffer, [0x25, 0x50, 0x44, 0x46])) {
    return { mimeType: "application/pdf", extension: ".pdf" };
  }
  if (matchesSignature(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { mimeType: "application/msword", extension: ".doc" };
  }
  const isZip =
    matchesSignature(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    matchesSignature(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    matchesSignature(buffer, [0x50, 0x4b, 0x07, 0x08]);
  if (isZip) {
    const headerText = buffer.subarray(0, Math.min(buffer.length, 8192)).toString("latin1");
    if (headerText.includes("[Content_Types].xml") && headerText.includes("word/")) {
      return {
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: ".docx"
      };
    }
  }
  if (isLikelyUtf8Text(buffer)) {
    return { mimeType: "text/plain", extension: ".txt" };
  }
  return null;
};

const ensureKindAllowedMime = (kind: UploadKind, mimeType: string) => {
  const allowedByKind: Record<UploadKind, Set<string>> = {
    SOURCE_DOCUMENT: new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]),
    TEMPLATE: new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]),
    EXECUTED_DOCUMENT: new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]),
    VENDOR_DOCUMENT: new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"])
  };
  if (!allowedByKind[kind].has(mimeType)) {
    throw new ApiError(400, "Unsupported file type. Allowed: PDF, DOC, DOCX, TXT.");
  }
};

const mimeAliasesByExtension: Record<string, Set<string>> = {
  ".pdf": new Set(["application/pdf"]),
  ".doc": new Set(["application/msword"]),
  ".docx": new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip"
  ]),
  ".txt": new Set(["text/plain"])
};

const getExtension = (fileName: string) => path.extname(fileName.trim()).toLowerCase();

const ensureAllowedExtension = (kind: UploadKind, fileName: string) => {
  const extension = getExtension(fileName);
  if (!extension || !allowedExtensionsByKind[kind].has(extension)) {
    throw new ApiError(400, "Unsupported file extension. Allowed: .pdf, .doc, .docx, .txt.");
  }
  return extension;
};

const ensureExtensionMatchesSignature = (providedExtension: string, detectedExtension: string) => {
  if (providedExtension !== detectedExtension) {
    throw new ApiError(400, "File extension does not match file content.");
  }
};

const ensureMimeMatchesSignature = (providedMimeType: string | null, detectedExtension: string) => {
  const normalized = (providedMimeType ?? "").trim().toLowerCase();
  if (!normalized || normalized === "application/octet-stream") {
    return;
  }
  const allowed = mimeAliasesByExtension[detectedExtension];
  if (!allowed?.has(normalized)) {
    throw new ApiError(400, "File content-type does not match file content.");
  }
};

export const ensureStoragePathIsSafe = (filePath: string) => {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(storageRoot + path.sep) && resolved !== storageRoot) {
    throw new ApiError(400, "Invalid file path.");
  }
};

export const saveUploadedFile = async (
  file: File,
  options?: { kind?: UploadKind; scanner?: MalwareScanner }
) => {
  const kind = options?.kind ?? "SOURCE_DOCUMENT";
  const maxSize = limitsByKind[kind];
  if (file.size > maxSize) {
    throw new ApiError(413, `File too large. Limit is ${Math.floor(maxSize / (1024 * 1024))}MB.`);
  }

  const providedExtension = ensureAllowedExtension(kind, file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectCanonicalType(bytes);
  if (!detected) {
    throw new ApiError(400, "Unsupported file type. Allowed: PDF, DOC, DOCX, TXT.");
  }
  ensureExtensionMatchesSignature(providedExtension, detected.extension);
  ensureMimeMatchesSignature(file.type ?? null, detected.extension);
  ensureKindAllowedMime(kind, detected.mimeType);

  if (detected.extension === ".pdf") {
    const pageCount = countPdfPages(bytes);
    if (pageCount > maxPdfPagesByKind[kind]) {
      throw new ApiError(413, `PDF page count exceeds limit of ${maxPdfPagesByKind[kind]}.`);
    }
  }

  if (detected.extension === ".docx") {
    enforceDocxArchiveLimits(bytes);
  }

  const scan = options?.scanner ?? scanUploadedBuffer;
  const scanResult = await scan({
    bytes,
    fileName: file.name,
    mimeType: detected.mimeType,
    kind
  });
  if (!scanResult.clean) {
    await ensureQuarantineDir();
    const quarantineId = randomUUID();
    const quarantineExtension = detected.extension || ".bin";
    const quarantineFilePath = path.join(quarantineDir, `${quarantineId}${quarantineExtension}`);
    const quarantineMetaPath = path.join(quarantineDir, `${quarantineId}.json`);
    ensureStoragePathIsSafe(quarantineFilePath);
    ensureStoragePathIsSafe(quarantineMetaPath);
    await fs.promises.writeFile(quarantineFilePath, bytes);
    await fs.promises.writeFile(
      quarantineMetaPath,
      JSON.stringify(
        {
          quarantineId,
          originalFileName: sanitizeDisplayName(file.name),
          detectedMimeType: detected.mimeType,
          sizeBytes: bytes.length,
          kind,
          reason: scanResult.reason ?? "malware_scan_failed",
          quarantinedAt: new Date().toISOString()
        },
        null,
        2
      ),
      "utf8"
    );
    throw new ApiError(
      400,
      `File rejected by malware scanner${scanResult.reason ? `: ${scanResult.reason}` : ""}. Quarantine ID: ${quarantineId}.`
    );
  }

  await ensureUploadsDir();
  const storedName = `${randomUUID()}${detected.extension}`;
  const filePath = path.join(uploadsDir, storedName);
  ensureStoragePathIsSafe(filePath);
  await fs.promises.writeFile(filePath, bytes);

  return {
    fileId: storedName.replace(detected.extension, ""),
    filePath,
    fileName: sanitizeDisplayName(file.name),
    mimeType: detected.mimeType,
    sizeBytes: bytes.length
  };
};
