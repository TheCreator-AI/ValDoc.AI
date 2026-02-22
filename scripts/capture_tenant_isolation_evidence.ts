import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const packsRoot = path.join(repoRoot, "evidence-packs");
const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPathFromArg = outputArg ? outputArg.slice("--out=".length) : "";

const findLatestPack = () => {
  if (!fs.existsSync(packsRoot)) return null;
  const candidates = fs
    .readdirSync(packsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("ValDocAI_EvidencePack_v"))
    .map((entry) => entry.name)
    .sort();
  if (candidates.length === 0) return null;
  return path.join(packsRoot, candidates[candidates.length - 1], "05-Tenant-Isolation-Proof", "run_output.txt");
};

const outputPath = outputPathFromArg || findLatestPack();
if (!outputPath) {
  console.error("[tenant-isolation-evidence] no evidence pack found. Generate one first with npm run evidence:pack.");
  process.exit(1);
}

const vitestArgs = [
  "vitest",
  "run",
  "src/test/api-regression/cross-org-api-groups.test.ts",
  "src/test/api-regression/cross-org-admin-endpoints.test.ts",
  "src/app/api/search/route.test.ts"
];
const result = spawnSync("npx", vitestArgs, {
  cwd: repoRoot,
  env: process.env,
  shell: process.platform === "win32",
  encoding: "utf8"
});

const combinedOutput = [result.stdout ?? "", result.stderr ?? ""].filter(Boolean).join("\n");
const resolvedOutputPath = path.isAbsolute(outputPath) ? outputPath : path.join(repoRoot, outputPath);
fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, combinedOutput, "utf8");
console.log(`[tenant-isolation-evidence] wrote output to ${resolvedOutputPath}`);

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}
