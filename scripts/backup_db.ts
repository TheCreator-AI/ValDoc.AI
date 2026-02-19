import path from "node:path";
import { backupDatabaseEncrypted } from "@/server/backup/service";

const parseArg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
};

const main = async () => {
  const dbPath = parseArg("db") ?? "storage/db/dev.db";
  const outDir = parseArg("out") ?? "backups";
  const key = parseArg("key") ?? process.env.BACKUP_ENCRYPTION_KEY ?? "";
  if (!key) {
    throw new Error("Missing backup encryption key. Provide --key or BACKUP_ENCRYPTION_KEY.");
  }

  const result = await backupDatabaseEncrypted({
    dbPath: path.resolve(dbPath),
    outputDir: path.resolve(outDir),
    encryptionKey: key
  });

  console.log(`[backup_db] artifact=${result.outputPath}`);
  console.log(`[backup_db] docs=${result.manifest.generatedDocumentCount} audits=${result.manifest.auditEventCount}`);
  console.log(`[backup_db] audit_chain_head=${result.manifest.auditChainHead || "(empty)"}`);
};

main().catch((error) => {
  console.error(`[backup_db] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
