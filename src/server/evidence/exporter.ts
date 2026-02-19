import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ZipFile } from "yazl";
import { prisma } from "@/server/db/prisma";
import { verifyAuditChain } from "@/server/audit/chain";

type EvidenceManifest = {
  generatedAt: string;
  artifacts: Record<string, string>;
};

const exportsDir = path.resolve(process.cwd(), "storage", "exports");

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export const buildEvidenceManifest = (artifactContents: Record<string, string>): EvidenceManifest => {
  const artifacts = Object.fromEntries(
    Object.entries(artifactContents).map(([name, content]) => [name, sha256(content)])
  );
  return {
    generatedAt: new Date().toISOString(),
    artifacts
  };
};

const toJsonArtifact = (artifactName: string, payload: unknown) => {
  const payloadJson = JSON.stringify(payload, null, 2);
  return JSON.stringify(
    {
      artifact_name: artifactName,
      generated_at: new Date().toISOString(),
      payload_sha256: sha256(payloadJson),
      payload
    },
    null,
    2
  );
};

const parseMaybeJson = (value: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const listLatestFromDirs = async (dirs: string[], patterns: RegExp[]) => {
  let latest: { filePath: string; mtimeMs: number } | null = null;
  for (const directory of dirs) {
    if (!fs.existsSync(directory)) continue;
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!patterns.some((pattern) => pattern.test(entry.name))) continue;
      const fullPath = path.join(directory, entry.name);
      const stat = await fs.promises.stat(fullPath);
      if (!latest || stat.mtimeMs > latest.mtimeMs) {
        latest = { filePath: fullPath, mtimeMs: stat.mtimeMs };
      }
    }
  }
  return latest;
};

const buildAuditChainVerification = async (organizationId: string) => {
  const events = await prisma.auditEvent.findMany({
    where: { organizationId },
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

  const chain = verifyAuditChain(
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

  const chainHead = await prisma.auditChainHead.findFirst({
    where: { organizationId },
    select: { headHash: true, updatedAt: true }
  });

  return {
    verification: chain,
    chain_head: chainHead?.headHash ?? null,
    chain_head_updated_at: chainHead?.updatedAt?.toISOString() ?? null,
    event_count: events.length
  };
};

export const exportEvidencePackage = async (params: {
  organizationId: string;
  actorUserId: string;
  dateFrom: Date;
  dateTo: Date;
}) => {
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  const organization = await prisma.organization.findFirst({
    where: { id: params.organizationId },
    select: { id: true, name: true, isActive: true, createdAt: true }
  });

  const users = await prisma.user.findMany({
    where: { organizationId: params.organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      userStatus: true,
      lastLoginAt: true,
      mfaEnabled: true,
      createdAt: true
    }
  });

  const audits = await prisma.auditEvent.findMany({
    where: {
      organizationId: params.organizationId,
      timestamp: {
        gte: params.dateFrom,
        lte: params.dateTo
      }
    },
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    select: {
      id: true,
      timestamp: true,
      actorUserId: true,
      action: true,
      entityType: true,
      entityId: true,
      outcome: true,
      metadataJson: true,
      detailsJson: true,
      ip: true,
      userAgent: true,
      changes: {
        select: {
          changePath: true,
          oldValue: true,
          newValue: true
        }
      }
    }
  });

  const versions = await prisma.documentVersion.findMany({
    where: {
      generatedDocument: {
        organizationId: params.organizationId
      },
      createdAt: {
        gte: params.dateFrom,
        lte: params.dateTo
      }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      generatedDocumentId: true,
      versionNumber: true,
      state: true,
      contentHash: true,
      signatureManifest: true,
      changeReason: true,
      changeComment: true,
      createdAt: true,
      editedBy: {
        select: {
          id: true,
          email: true
        }
      },
      generatedDocument: {
        select: {
          id: true,
          title: true,
          docType: true
        }
      }
    }
  });

  const signatures = await prisma.electronicSignature.findMany({
    where: {
      organizationId: params.organizationId,
      recordType: "GENERATED_DOCUMENT",
      signedAt: {
        gte: params.dateFrom,
        lte: params.dateTo
      }
    },
    orderBy: [{ signedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      recordId: true,
      recordVersionId: true,
      signerUserId: true,
      signerFullName: true,
      meaning: true,
      signedAt: true,
      signatureManifest: true
    }
  });

  const backupLogCandidate = await listLatestFromDirs(
    [path.join(process.cwd(), "storage", "backups"), path.join(process.cwd(), "storage", "logs")],
    [/verify/i, /restore/i, /\.log$/i, /\.txt$/i, /\.json$/i]
  );
  const backupLog = backupLogCandidate
    ? {
        source_file: backupLogCandidate.filePath,
        modified_at: new Date(backupLogCandidate.mtimeMs).toISOString(),
        content: await fs.promises.readFile(backupLogCandidate.filePath, "utf8")
      }
    : {
        note: "No backup/restore verification log file was found in storage/backups or storage/logs."
      };

  const securityCandidate = await listLatestFromDirs(
    [path.join(process.cwd(), "reports", "security"), path.join(process.cwd(), "storage", "security")],
    [/audit/i, /semgrep/i, /gitleaks/i, /\.json$/i, /\.txt$/i, /\.log$/i]
  );

  const securityReport = securityCandidate
    ? {
        source_file: securityCandidate.filePath,
        modified_at: new Date(securityCandidate.mtimeMs).toISOString(),
        content: await fs.promises.readFile(securityCandidate.filePath, "utf8")
      }
    : {
        note: "No local security scan output file found; include CI run artifacts from GitHub Actions as supporting evidence.",
        ci_workflow_reference: ".github/workflows/ci.yml"
      };

  const auditChainResult = await buildAuditChainVerification(params.organizationId);

  const artifactContents: Record<string, string> = {
    "system-configuration.json": toJsonArtifact("system-configuration.json", {
      app_timezone: process.env.APP_TIMEZONE ?? "UTC",
      node_env: process.env.NODE_ENV ?? "development",
      has_database_url: Boolean(process.env.DATABASE_URL),
      has_session_secret: Boolean(process.env.SESSION_SECRET),
      has_backup_encryption_key: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
      organization
    }),
    "users-roles.json": toJsonArtifact("users-roles.json", users.map((user) => ({
      ...user,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString()
    }))),
    "audit-trail.json": toJsonArtifact("audit-trail.json", audits.map((event) => ({
      ...event,
      timestamp: event.timestamp.toISOString(),
      metadata: parseMaybeJson(event.metadataJson),
      details: parseMaybeJson(event.detailsJson)
    }))),
    "document-version-history-signatures.json": toJsonArtifact("document-version-history-signatures.json", {
      versions: versions.map((version) => ({
        ...version,
        createdAt: version.createdAt.toISOString()
      })),
      signatures: signatures.map((signature) => ({
        ...signature,
        signedAt: signature.signedAt.toISOString()
      }))
    }),
    "audit-chain-verification.json": toJsonArtifact("audit-chain-verification.json", auditChainResult),
    "backup-restore-last-verification-log.json": toJsonArtifact("backup-restore-last-verification-log.json", backupLog),
    "ci-security-scan-results-latest.json": toJsonArtifact("ci-security-scan-results-latest.json", securityReport)
  };

  const preIndexManifest = buildEvidenceManifest(artifactContents);
  const indexLines = [
    "# Evidence Export Package",
    "",
    `Generated At (UTC): ${new Date().toISOString()}`,
    `Generated By User ID: ${params.actorUserId}`,
    `Date Range: ${params.dateFrom.toISOString()} -> ${params.dateTo.toISOString()}`,
    "",
    "Artifacts:",
    ...Object.entries(preIndexManifest.artifacts).map(([fileName, hash]) => `- ${fileName}: ${hash}`)
  ];
  artifactContents["index.md"] = indexLines.join("\n");

  const finalManifest = buildEvidenceManifest(artifactContents);
  const zipPath = path.join(exportsDir, `evidence-${randomUUID()}.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const zip = new ZipFile();

    output.on("close", () => resolve());
    output.on("error", (error) => reject(error));
    zip.outputStream.on("error", (error) => reject(error));

    zip.outputStream.pipe(output);
    for (const [fileName, content] of Object.entries(artifactContents)) {
      zip.addBuffer(Buffer.from(content, "utf8"), fileName);
    }
    zip.addBuffer(Buffer.from(JSON.stringify(finalManifest, null, 2), "utf8"), "manifest.json");
    zip.end();
  });

  return {
    filePath: zipPath,
    manifest: finalManifest
  };
};
