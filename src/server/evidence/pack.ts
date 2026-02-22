import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

type EvidenceContext = {
  version: string;
  date: string;
  gitSha: string;
  deploymentEnv: string;
};

type EvidenceFile = {
  relativePath: string;
  content: string;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const buildEvidencePackFolderName = (version: string, date: string) =>
  `ValDocAI_EvidencePack_v${version}_${date}`;

const minimalArchitecturePdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 106 >>
stream
BT
/F1 14 Tf
72 740 Td
(ValDoc.AI Architecture 1-Page Placeholder) Tj
0 -24 Td
(Browser -> App -> DB -> Object Storage -> Search) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000010 00000 n
0000000064 00000 n
0000000121 00000 n
0000000265 00000 n
0000000421 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
491
%%EOF
`;

const buildReleaseNotes = (context: EvidenceContext) => `# Release Notes

- Version: ${context.version}
- Git SHA: ${context.gitSha}
- Evidence Date: ${context.date}
- Risk Level: TBD (Low / Medium / High)

## What Changed
- Update this section with release scope and user impact.

## Why Changed
- Link this release to change requests, defects, and compliance actions.

## Validation Impact
- List affected controls, tests, and required re-verification.
`;

const buildSecurityReadme = () => `# Security Controls Overview

## Threat Model Summary
- Threat actors: authenticated users, malicious insiders, external attackers.
- Primary risks: unauthorized access, cross-org data leakage, record tampering.

## Implemented Controls (Summary)
- RBAC enforced server-side on all protected endpoints.
- Organization scoping enforced in data access layer.
- Append-only audit trail with hash-chain verification.
- E-signatures with re-authentication and content hash binding.
- State-machine lifecycle with approved-version immutability.
- File validation: allowlist, signature checks, size limits, malware scan hook.
- Security headers, CSRF protections, secure session handling.
`;

const buildDataClassification = () => `# Data Classification

## Data Stored
- User accounts, roles, and auth/audit events.
- Equipment records, templates, generated documents, signatures.
- Uploaded files and generated exports with integrity hashes.

## Data Not Stored (Expected)
- Raw plaintext secrets.
- Customer credentials for external systems.
- Payment card data.

## Handling Notes
- Use least privilege access.
- Keep backups encrypted and access-controlled.
- Apply retention + legal hold policies.
`;

const buildUiChecklistTemplate = () => `# Manual UI OQ Checklist

Tester:
Date:
Environment:

## Core Checks
- [ ] Cross-org access denied
- [ ] Approval immutability enforced
- [ ] Signature re-auth prompt shown
- [ ] Audit verify-chain success shown
- [ ] Export success (DOCX/PDF)
`;

const buildAuditSignatureEvidenceTemplate = () => `# Signature Flow Evidence

## Steps
1. Open target record version in IN_REVIEW.
2. Start sign action with required signature meaning.
3. Re-enter password when prompted.
4. Confirm signature record + manifest hash saved.
5. Confirm approved version is immutable.

## Evidence
- Screenshot: re-auth prompt
- Screenshot: signature metadata on record
- Screenshot: blocked edit after approval
`;

const buildTamperSimulationTemplate = () => `# Tamper Simulation (Staging Only)

## Goal
Demonstrate audit chain verification failure when an event is modified out-of-band.

## Procedure
1. Baseline chain verification should pass.
2. Modify one audit record directly in staging test DB.
3. Re-run verify-chain endpoint/report.

## Expected
- Verification fails.
- First broken event id is reported.
- Incident/audit follow-up logged.
`;

const buildSecretsPolicyTemplate = () => `# Secrets Policy

- All secrets are provided through environment variables or secrets manager.
- No secrets are committed to source control.
- Rotation cadence: define per environment.
- Access is restricted to minimum operational roles.
`;

const buildLoggingRedactionTemplate = () => `# Logging and Redaction

## Always Log
- Security-relevant actions and outcomes.
- Actor id, org id, action, entity references.

## Never Log
- Passwords, session secrets, raw credentials.
- Full sensitive document content unless explicitly required.

## Notes
- Ensure structured logs and scrubbed metadata.
`;

export const getEvidencePackFiles = (context: EvidenceContext): EvidenceFile[] => [
  {
    relativePath: "00-Release-Metadata/RELEASE_NOTES.md",
    content: buildReleaseNotes(context)
  },
  {
    relativePath: "00-Release-Metadata/VERSION.txt",
    content: `${context.version}\n${context.gitSha}\n`
  },
  {
    relativePath: "00-Release-Metadata/DEPLOYMENT_ENV.txt",
    content: `${context.deploymentEnv}\nregion=TBD\ncluster_or_app_name=TBD\n`
  },
  {
    relativePath: "01-Controls-Overview/SECURITY_README.md",
    content: buildSecurityReadme()
  },
  {
    relativePath: "01-Controls-Overview/ARCHITECTURE_1PAGE.pdf",
    content: minimalArchitecturePdf
  },
  {
    relativePath: "01-Controls-Overview/DATA_CLASSIFICATION.md",
    content: buildDataClassification()
  },
  {
    relativePath: "02-Automated-Security-Scans/npm-audit.txt",
    content: "Attach output from `npm run security:audit`.\n"
  },
  {
    relativePath: "02-Automated-Security-Scans/gitleaks.txt",
    content: "Attach output from `npm run secrets:scan`.\n"
  },
  {
    relativePath: "02-Automated-Security-Scans/semgrep.json",
    content: '{\n  "note": "Attach output from `npm run security:sast`."\n}\n'
  },
  {
    relativePath: "02-Automated-Security-Scans/SBOM.cdx.json",
    content: '{\n  "note": "Attach output from `npm run security:sbom`."\n}\n'
  },
  {
    relativePath: "02-Automated-Security-Scans/SBOM_SHA256.txt",
    content: "Compute SHA256 of SBOM.cdx.json and place value here.\n"
  },
  {
    relativePath: "02-Automated-Security-Scans/DEPENDENCY_LOCKFILE_SHA256.txt",
    content: "Compute SHA256 of package-lock.json and place value here.\n"
  },
  {
    relativePath: "03-Automated-Tests/unit_integration_test_output.txt",
    content: "Attach output from `npm test`.\n"
  },
  {
    relativePath: "03-Automated-Tests/coverage_summary.txt",
    content: "Attach coverage summary output.\n"
  },
  {
    relativePath: "03-Automated-Tests/multi_tenant_isolation_tests_output.txt",
    content: "Attach output for cross-org regression test suite.\n"
  },
  {
    relativePath: "03-Automated-Tests/export_quality_gate_tests_output.txt",
    content: "Attach output for export + quality gate tests.\n"
  },
  {
    relativePath: "04-Manual-UI-OQ-Evidence/manual_ui_checklist_signed.md",
    content: buildUiChecklistTemplate()
  },
  {
    relativePath: "04-Manual-UI-OQ-Evidence/money_shots_manifest.md",
    content:
      "- Cross-org access denied\n- Approval immutability (edit blocked)\n- Signature re-auth prompt\n- Audit verify-chain success\n- Export success\n"
  },
  {
    relativePath: "05-Tenant-Isolation-Proof/tenant_isolation_e2e_tests/README.md",
    content: "Reference API regression tests in src/test/api-regression.\n"
  },
  {
    relativePath: "05-Tenant-Isolation-Proof/run_output.txt",
    content: "Attach test run output for tenant isolation suite.\n"
  },
  {
    relativePath: "05-Tenant-Isolation-Proof/test_data_setup.md",
    content: "Describe org/user/object setup used for isolation proof.\n"
  },
  {
    relativePath: "06-Audit-and-Signature-Proof/audit_verify_chain_report.json",
    content: '{\n  "note": "Attach output from audit chain verification endpoint."\n}\n'
  },
  {
    relativePath: "06-Audit-and-Signature-Proof/signature_flow_evidence.md",
    content: buildAuditSignatureEvidenceTemplate()
  },
  {
    relativePath: "06-Audit-and-Signature-Proof/tamper_simulation.md",
    content: buildTamperSimulationTemplate()
  },
  {
    relativePath: "07-Deployment-Hardening/prod_headers_curl.txt",
    content: "Attach curl header capture from production/staging endpoint.\n"
  },
  {
    relativePath: "07-Deployment-Hardening/secrets_policy.md",
    content: buildSecretsPolicyTemplate()
  },
  {
    relativePath: "07-Deployment-Hardening/backup_restore_proof.md",
    content: "Attach latest backup + restore verification details.\n"
  },
  {
    relativePath: "07-Deployment-Hardening/logging_redaction.md",
    content: buildLoggingRedactionTemplate()
  }
];

export const generateEvidencePack = (params: {
  rootDir: string;
  version: string;
  date: string;
  gitSha: string;
  deploymentEnv: string;
}) => {
  const folderName = buildEvidencePackFolderName(params.version, params.date);
  const targetDir = path.join(params.rootDir, folderName);
  fs.mkdirSync(targetDir, { recursive: true });

  const files = getEvidencePackFiles({
    version: params.version,
    date: params.date,
    gitSha: params.gitSha,
    deploymentEnv: params.deploymentEnv
  });

  for (const file of files) {
    const absolutePath = path.join(targetDir, file.relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const isPdf = file.relativePath.endsWith(".pdf");
    if (isPdf) {
      fs.writeFileSync(absolutePath, Buffer.from(file.content, "utf8"));
    } else {
      fs.writeFileSync(absolutePath, file.content, "utf8");
    }
  }

  const manifest = files
    .filter((file) => !file.relativePath.endsWith(".pdf"))
    .map((file) => `${file.relativePath},${sha256(file.content)}`)
    .join("\n");
  fs.writeFileSync(path.join(targetDir, "MANIFEST_SHA256.csv"), `file,sha256\n${manifest}\n`, "utf8");

  return {
    folderName,
    targetDir
  };
};
