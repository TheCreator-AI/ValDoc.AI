import { describe, expect, it } from "vitest";
import { getDeploymentReadiness } from "@/server/security/readiness";

const baseEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:pw@db/valdoc",
  RATE_LIMIT_BACKEND: "redis",
  REDIS_REST_URL: "https://redis.example.com",
  REDIS_REST_TOKEN: "redis-token-abcdefghijklmnopqrstuvwxyz",
  BACKUP_ENCRYPTION_KEY: "backup-key-abcdefghijklmnopqrstuvwxyz123456",
  MALWARE_SCANNER_PROVIDER: "managed",
  MANAGED_MALWARE_SCAN_URL: "https://scanner.example.com",
  MANAGED_MALWARE_SCAN_TOKEN: "managed-token-abcdefghijklmnopqrstuvwxyz",
  AUDIT_CHAIN_VERIFY_CRON: "0 2 * * *",
  ENABLE_OPENSEARCH: "true",
  OPENSEARCH_URL: "https://search.example.com",
  OPENSEARCH_SECURITY_DISABLED: "false",
  OPENSEARCH_USERNAME: "valdoc",
  OPENSEARCH_PASSWORD: "opensearch-strong-password",
  MINIO_ROOT_USER: "vault-user",
  MINIO_ROOT_PASSWORD: "vault-password-strong"
};

describe("getDeploymentReadiness", () => {
  it("passes when production controls are configured", () => {
    const result = getDeploymentReadiness(baseEnv);
    expect(result.ready).toBe(true);
    expect(result.checks.every((check) => check.status !== "fail")).toBe(true);
  });

  it("fails when production malware scanner is stub", () => {
    const result = getDeploymentReadiness({
      ...baseEnv,
      MALWARE_SCANNER_PROVIDER: "stub"
    });
    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "malware_scanner",
          status: "fail"
        })
      ])
    );
  });

  it("fails when production database is not postgres", () => {
    const result = getDeploymentReadiness({
      ...baseEnv,
      DATABASE_URL: "file:./dev.db"
    });
    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "database_posture",
          status: "fail"
        })
      ])
    );
  });
});
