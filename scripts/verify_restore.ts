import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyRestoreIntegrity } from "@/server/backup/service";

const parseArg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
};

const main = async () => {
  const backupFile = parseArg("backup");
  const key = parseArg("key") ?? process.env.BACKUP_ENCRYPTION_KEY ?? "";
  if (!backupFile) {
    throw new Error("Missing --backup <path>.");
  }
  if (!key) {
    throw new Error("Missing backup encryption key. Provide --key or BACKUP_ENCRYPTION_KEY.");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "valdoc-restore-verify-"));
  try {
    const result = await verifyRestoreIntegrity({
      backupFile: path.resolve(backupFile),
      tempDir,
      encryptionKey: key
    });
    console.log(`[verify_restore] pass=${result.pass}`);
    console.log(`[verify_restore] restored_db=${result.restoredDbPath}`);
    console.log(`[verify_restore] expected_docs=${result.expected.generatedDocumentCount} actual_docs=${result.actual.generatedDocumentCount}`);
    console.log(`[verify_restore] expected_audits=${result.expected.auditEventCount} actual_audits=${result.actual.auditEventCount}`);
    console.log(`[verify_restore] expected_chain_head=${result.expected.auditChainHead || "(empty)"}`);
    console.log(`[verify_restore] actual_chain_head=${result.actual.auditChainHead || "(empty)"}`);
    if (!result.pass) {
      process.exitCode = 2;
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(`[verify_restore] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
