import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildEvidencePackFolderName, generateEvidencePack, getEvidencePackFiles } from "./pack";

describe("evidence pack scaffold", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("builds the required folder name format", () => {
    expect(buildEvidencePackFolderName("1.2.3", "2026-02-22")).toBe("ValDocAI_EvidencePack_v1.2.3_2026-02-22");
  });

  it("contains the required top-level evidence files", () => {
    const files = getEvidencePackFiles({
      version: "1.2.3",
      date: "2026-02-22",
      gitSha: "abc1234",
      deploymentEnv: "staging"
    });
    const paths = files.map((file) => file.relativePath);
    expect(paths).toContain("00-Release-Metadata/RELEASE_NOTES.md");
    expect(paths).toContain("01-Controls-Overview/ARCHITECTURE_1PAGE.pdf");
    expect(paths).toContain("02-Automated-Security-Scans/SBOM.cdx.json");
    expect(paths).toContain("03-Automated-Tests/unit_integration_test_output.txt");
    expect(paths).toContain("04-Manual-UI-OQ-Evidence/manual_ui_checklist_signed.md");
    expect(paths).toContain("05-Tenant-Isolation-Proof/run_output.txt");
    expect(paths).toContain("06-Audit-and-Signature-Proof/audit_verify_chain_report.json");
    expect(paths).toContain("07-Deployment-Hardening/prod_headers_curl.txt");
  });

  it("writes scaffold files and manifest to disk", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-pack-"));
    tempDirs.push(rootDir);
    const result = generateEvidencePack({
      rootDir,
      version: "2.0.0",
      date: "2026-02-22",
      gitSha: "fed0845",
      deploymentEnv: "prod"
    });

    expect(fs.existsSync(path.join(result.targetDir, "00-Release-Metadata", "RELEASE_NOTES.md"))).toBe(true);
    expect(fs.existsSync(path.join(result.targetDir, "01-Controls-Overview", "ARCHITECTURE_1PAGE.pdf"))).toBe(true);
    expect(fs.existsSync(path.join(result.targetDir, "MANIFEST_SHA256.csv"))).toBe(true);
    const versionText = fs.readFileSync(path.join(result.targetDir, "00-Release-Metadata", "VERSION.txt"), "utf8");
    expect(versionText).toContain("2.0.0");
    expect(versionText).toContain("fed0845");
  });
});
