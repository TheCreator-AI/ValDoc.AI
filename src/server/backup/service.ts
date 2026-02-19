import fs from "node:fs/promises";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { verifyAuditChain } from "@/server/audit/chain";

type BackupManifest = {
  generatedDocumentCount: number;
  latestVersionHashes: Record<string, string | null>;
  auditEventCount: number;
  auditChainHead: string;
};

type BackupArtifact = {
  version: 1;
  createdAtUtc: string;
  algorithm: "aes-256-gcm";
  ivBase64: string;
  authTagBase64: string;
  ciphertextBase64: string;
  manifest: BackupManifest;
};

const sqliteUrlFromPath = (dbPath: string) => {
  const normalized = path.resolve(dbPath).replaceAll("\\", "/");
  return `file:${normalized}`;
};

const createClientForDb = (dbPath: string) =>
  new PrismaClient({
    datasourceUrl: sqliteUrlFromPath(dbPath)
  });

const deriveKey = (encryptionKey: string) => scryptSync(encryptionKey, "valdoc-ai-backup-salt", 32);

const collectManifest = async (client: PrismaClient): Promise<BackupManifest> => {
  const docs = await client.generatedDocument.findMany({
    select: {
      id: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { contentHash: true }
      }
    }
  });
  const latestVersionHashes = Object.fromEntries(
    docs.map((document) => [document.id, document.versions[0]?.contentHash ?? null])
  );

  const events = await client.auditEvent.findMany({
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    select: {
      id: true,
      prevHash: true,
      eventHash: true,
      organizationId: true,
      actorUserId: true,
      action: true,
      entityType: true,
      entityId: true,
      outcome: true,
      metadataJson: true,
      detailsJson: true,
      ip: true,
      userAgent: true,
      timestamp: true
    }
  });
  const verification = verifyAuditChain(
    events.map((event) => ({
      id: event.id,
      prevHash: event.prevHash,
      eventHash: event.eventHash,
      payload: {
        organizationId: event.organizationId,
        actorUserId: event.actorUserId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        outcome: event.outcome,
        metadataJson: event.metadataJson,
        detailsJson: event.detailsJson,
        ip: event.ip,
        userAgent: event.userAgent,
        timestampIso: event.timestamp.toISOString()
      }
    }))
  );
  const chainHead = await client.auditChainHead.findFirst({
    select: { headHash: true }
  });

  if (!verification.ok) {
    throw new Error(`Audit chain is broken at event ${verification.brokenEventId ?? "unknown"}.`);
  }
  if ((verification.headHash ?? "") !== (chainHead?.headHash ?? "")) {
    throw new Error("Audit chain head mismatch.");
  }

  return {
    generatedDocumentCount: docs.length,
    latestVersionHashes,
    auditEventCount: events.length,
    auditChainHead: chainHead?.headHash ?? ""
  };
};

export const backupDatabaseEncrypted = async (params: {
  dbPath: string;
  outputDir: string;
  encryptionKey: string;
}) => {
  const dbBytes = await fs.readFile(params.dbPath);
  const client = createClientForDb(params.dbPath);
  try {
    const manifest = await collectManifest(client);
    await fs.mkdir(params.outputDir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "").replaceAll("-", "").replace("T", "-").slice(0, 15);
    const outputPath = path.join(params.outputDir, `valdoc-db-${stamp}.backup.enc`);

    const key = deriveKey(params.encryptionKey);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(dbBytes), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const artifact: BackupArtifact = {
      version: 1,
      createdAtUtc: new Date().toISOString(),
      algorithm: "aes-256-gcm",
      ivBase64: iv.toString("base64"),
      authTagBase64: authTag.toString("base64"),
      ciphertextBase64: ciphertext.toString("base64"),
      manifest
    };
    await fs.writeFile(outputPath, JSON.stringify(artifact, null, 2), "utf8");
    return { outputPath, manifest };
  } finally {
    await client.$disconnect();
  }
};

const readArtifact = async (backupFile: string): Promise<BackupArtifact> => {
  const raw = await fs.readFile(backupFile, "utf8");
  return JSON.parse(raw) as BackupArtifact;
};

const decryptArtifact = (artifact: BackupArtifact, encryptionKey: string) => {
  const key = deriveKey(encryptionKey);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(artifact.ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(artifact.authTagBase64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(artifact.ciphertextBase64, "base64")),
    decipher.final()
  ]);
};

export const restoreDatabaseEncrypted = async (params: {
  backupFile: string;
  targetDbPath: string;
  encryptionKey: string;
}) => {
  const artifact = await readArtifact(params.backupFile);
  const plaintext = decryptArtifact(artifact, params.encryptionKey);
  await fs.mkdir(path.dirname(params.targetDbPath), { recursive: true });
  await fs.writeFile(params.targetDbPath, plaintext);
  return { targetDbPath: params.targetDbPath, manifest: artifact.manifest };
};

const mapsEqual = (a: Record<string, string | null>, b: Record<string, string | null>) => {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let index = 0; index < keysA.length; index += 1) {
    const key = keysA[index];
    if (key !== keysB[index]) return false;
    if (a[key] !== b[key]) return false;
  }
  return true;
};

export const verifyRestoreIntegrity = async (params: {
  backupFile: string;
  tempDir: string;
  encryptionKey: string;
}) => {
  const restoredDbPath = path.join(params.tempDir, `restore-${Date.now()}.db`);
  const restored = await restoreDatabaseEncrypted({
    backupFile: params.backupFile,
    targetDbPath: restoredDbPath,
    encryptionKey: params.encryptionKey
  });
  const client = createClientForDb(restoredDbPath);
  try {
    const actual = await collectManifest(client);
    const pass =
      restored.manifest.generatedDocumentCount === actual.generatedDocumentCount &&
      restored.manifest.auditEventCount === actual.auditEventCount &&
      restored.manifest.auditChainHead === actual.auditChainHead &&
      mapsEqual(restored.manifest.latestVersionHashes, actual.latestVersionHashes);
    return {
      pass,
      restoredDbPath,
      expected: restored.manifest,
      actual
    };
  } finally {
    await client.$disconnect();
  }
};
