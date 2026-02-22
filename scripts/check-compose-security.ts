import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const composeFiles = fs
  .readdirSync(repoRoot)
  .filter((name) => /^docker-compose(\..+)?\.ya?ml$/i.test(name))
  .filter((name) => !name.toLowerCase().includes(".dev."));

const forbiddenPatterns = [
  /DISABLE_SECURITY_PLUGIN:\s*["']?true["']?/i,
  /plugins\.security\.disabled:\s*["']?true["']?/i,
  /MINIO_ROOT_USER:\s*(\$\{MINIO_ROOT_USER:-minioadmin\}|["']?minioadmin["']?)/i,
  /MINIO_ROOT_PASSWORD:\s*(\$\{MINIO_ROOT_PASSWORD:-minioadmin\}|["']?minioadmin["']?)/i
];

const violations: string[] = [];

for (const fileName of composeFiles) {
  const fullPath = path.join(repoRoot, fileName);
  const content = fs.readFileSync(fullPath, "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      violations.push(`${fileName}: matches forbidden pattern ${pattern}`);
    }
  }
}

if (violations.length > 0) {
  console.error("[compose-security] Forbidden OpenSearch insecure defaults found in non-dev compose files:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.info(`[compose-security] OK (${composeFiles.length} non-dev compose file(s) checked).`);
