import path from "node:path";
import { restoreDatabaseEncrypted } from "@/server/backup/service";

const parseArg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
};

const main = async () => {
  const backupFile = parseArg("backup");
  const dbPath = parseArg("db") ?? "storage/db/dev.db";
  const key = parseArg("key") ?? process.env.BACKUP_ENCRYPTION_KEY ?? "";

  if (!backupFile) {
    throw new Error("Missing --backup <path>.");
  }
  if (!key) {
    throw new Error("Missing backup encryption key. Provide --key or BACKUP_ENCRYPTION_KEY.");
  }

  const result = await restoreDatabaseEncrypted({
    backupFile: path.resolve(backupFile),
    targetDbPath: path.resolve(dbPath),
    encryptionKey: key
  });

  console.log(`[restore_db] restored=${result.targetDbPath}`);
  console.log(`[restore_db] docs=${result.manifest.generatedDocumentCount} audits=${result.manifest.auditEventCount}`);
  console.log(`[restore_db] audit_chain_head=${result.manifest.auditChainHead || "(empty)"}`);
};

main().catch((error) => {
  console.error(`[restore_db] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
