import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { generateEvidencePack } from "../src/server/evidence/pack";

const getArgValue = (flag: string) => {
  const arg = process.argv.find((entry) => entry.startsWith(`${flag}=`));
  return arg ? arg.slice(flag.length + 1) : null;
};

const versionArg = getArgValue("--version");
const dateArg = getArgValue("--date");
const envArg = getArgValue("--env");

const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as { version: string };

const version = versionArg ?? packageJson.version;
const date = dateArg ?? new Date().toISOString().slice(0, 10);
const deploymentEnv = envArg ?? process.env.NODE_ENV ?? "development";

let gitSha = "unknown";
try {
  gitSha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  // Intentionally fallback for non-git execution contexts.
}

const baseDir = path.resolve(process.cwd(), "evidence-packs");
const result = generateEvidencePack({
  rootDir: baseDir,
  version,
  date,
  gitSha,
  deploymentEnv
});

console.log(`[evidence-pack] generated: ${result.targetDir}`);
