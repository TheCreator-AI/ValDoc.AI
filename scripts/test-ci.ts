import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const root = process.cwd();
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./prisma/storage/db/ci.db";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "ci-test-jwt-secret-012345678901234567890";
process.env.CUSTOMER_ID = process.env.CUSTOMER_ID ?? "ci-org";
process.env.ORG_NAME = process.env.ORG_NAME ?? "CI Organization";

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run("npx", ["prisma", "db", "push"]);
run("npx", ["vitest", "run"]);
