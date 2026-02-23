import { describe, expect, it, vi } from "vitest";
import { getRequiredEnv, validateRequiredEnv, validateStartupConfig } from "@/server/config/env";

describe("env config guard", () => {
  it("throws when required env vars are missing", () => {
    expect(() =>
      validateRequiredEnv({
        DATABASE_URL: "",
        JWT_SECRET: "",
        CUSTOMER_ID: "",
        ORG_NAME: ""
      })
    ).toThrow(/Missing required environment variables/);
  });

  it("returns normalized env when all required vars are present", () => {
    const env = validateRequiredEnv({
      DATABASE_URL: "postgresql://app:password@localhost/valdoc",
      JWT_SECRET: "super-long-test-secret-0123456789",
      CUSTOMER_ID: "qa-org",
      ORG_NAME: "QA Organization"
    });

    expect(env.CUSTOMER_ID).toBe("qa-org");
    expect(env.ORG_NAME).toBe("QA Organization");
  });

  it("validates process env from getRequiredEnv()", () => {
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      CUSTOMER_ID: process.env.CUSTOMER_ID,
      ORG_NAME: process.env.ORG_NAME
    };
    process.env.DATABASE_URL = "postgresql://app:password@localhost/valdoc";
    process.env.JWT_SECRET = "super-long-test-secret-0123456789";
    process.env.CUSTOMER_ID = "qa-org";
    process.env.ORG_NAME = "QA Organization";

    expect(getRequiredEnv().ORG_NAME).toBe("QA Organization");

    process.env.DATABASE_URL = previous.DATABASE_URL;
    process.env.JWT_SECRET = previous.JWT_SECRET;
    process.env.CUSTOMER_ID = previous.CUSTOMER_ID;
    process.env.ORG_NAME = previous.ORG_NAME;
  });

  it("throws when JWT secret is weak", () => {
    expect(() =>
      validateRequiredEnv({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "replace-with-long-random-secret",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization"
      })
    ).toThrow(/JWT_SECRET/);
  });

  it("logs startup validation when config is valid", () => {
    const logger = vi.fn();
    validateStartupConfig(
      {
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization"
      },
      logger
    );

    expect(logger).toHaveBeenCalledWith(expect.stringContaining("Config validation executed"));
  });

  it("rejects production startup when OpenSearch security is disabled", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        ENABLE_OPENSEARCH: "true",
        OPENSEARCH_SECURITY_DISABLED: "true"
      })
    ).toThrow(/OpenSearch security must be enabled/);
  });

  it("rejects production startup when OpenSearch uses non-TLS URL", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        ENABLE_OPENSEARCH: "true",
        OPENSEARCH_SECURITY_DISABLED: "false",
        OPENSEARCH_URL: "http://opensearch.internal:9200",
        OPENSEARCH_USERNAME: "valdoc-indexer",
        OPENSEARCH_PASSWORD: "very-strong-password"
      })
    ).toThrow(/OpenSearch URL must use https/i);
  });

  it("rejects production startup when OpenSearch least-privilege credentials are missing", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        ENABLE_OPENSEARCH: "true",
        OPENSEARCH_SECURITY_DISABLED: "false",
        OPENSEARCH_URL: "https://opensearch.internal:9200"
      })
    ).toThrow(/OpenSearch credentials are required/i);
  });

  it("rejects production startup when backup encryption key is missing", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        BACKUP_ENCRYPTION_KEY: ""
      })
    ).toThrow(/BACKUP_ENCRYPTION_KEY/);
  });

  it("rejects production startup when backup encryption key is weak", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        BACKUP_ENCRYPTION_KEY: "changeme"
      })
    ).toThrow(/BACKUP_ENCRYPTION_KEY/);
  });

  it("rejects startup when idle timeout is greater than absolute session max age", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        SESSION_MAX_AGE_SECONDS: "1800",
        SESSION_IDLE_TIMEOUT_SECONDS: "3600"
      })
    ).toThrow(/SESSION_IDLE_TIMEOUT_SECONDS/);
  });

  it("rejects production startup when session max age is unreasonably long", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        BACKUP_ENCRYPTION_KEY: "super-long-backup-encryption-key-0123456789",
        RATE_LIMIT_BACKEND: "gateway",
        SESSION_MAX_AGE_SECONDS: "172801",
        SESSION_IDLE_TIMEOUT_SECONDS: "1800"
      })
    ).toThrow(/SESSION_MAX_AGE_SECONDS/);
  });

  it("rejects production startup when distributed rate limit backend is not configured", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        BACKUP_ENCRYPTION_KEY: "super-long-backup-encryption-key-0123456789",
        RATE_LIMIT_BACKEND: "memory"
      })
    ).toThrow(/RATE_LIMIT_BACKEND/);
  });

  it("rejects production startup when default MinIO credentials are configured", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        BACKUP_ENCRYPTION_KEY: "super-long-backup-encryption-key-0123456789",
        RATE_LIMIT_BACKEND: "gateway",
        MINIO_ROOT_USER: "minioadmin",
        MINIO_ROOT_PASSWORD: "minioadmin"
      })
    ).toThrow(/MinIO/);
  });

  it("accepts production startup when Redis rate limiting is configured securely", () => {
    const logger = vi.fn();
    validateStartupConfig(
      {
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        BACKUP_ENCRYPTION_KEY: "super-long-backup-encryption-key-0123456789",
        AUDIT_CHAIN_VERIFY_CRON: "0 2 * * *",
        RATE_LIMIT_BACKEND: "redis",
        REDIS_REST_URL: "https://redis.example.com",
        REDIS_REST_TOKEN: "super-long-redis-token-value-123456"
      },
      logger
    );
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("Config validation executed"));
  });

  it("rejects production startup when malware scanner provider is stub", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        BACKUP_ENCRYPTION_KEY: "super-long-backup-encryption-key-0123456789",
        RATE_LIMIT_BACKEND: "gateway",
        MALWARE_SCANNER_PROVIDER: "stub"
      })
    ).toThrow(/MALWARE_SCANNER_PROVIDER/);
  });

  it("rejects production startup when managed malware scanner is selected without endpoint/token", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        BACKUP_ENCRYPTION_KEY: "super-long-backup-encryption-key-0123456789",
        RATE_LIMIT_BACKEND: "gateway",
        MALWARE_SCANNER_PROVIDER: "managed",
        MANAGED_MALWARE_SCAN_URL: "",
        MANAGED_MALWARE_SCAN_TOKEN: ""
      })
    ).toThrow(/MANAGED_MALWARE_SCAN/);
  });

  it("rejects startup when CLIENT_FEATURE_FLAGS_JSON contains unknown flags", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        CLIENT_FEATURE_FLAGS_JSON: JSON.stringify({ DOES_NOT_EXIST: true })
      })
    ).toThrow(/Unknown feature flag/);
  });

  it("rejects production startup when database is not postgres", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "file:./dev.db",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        BACKUP_ENCRYPTION_KEY: "super-long-backup-encryption-key-0123456789",
        RATE_LIMIT_BACKEND: "gateway"
      })
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects production startup when audit-chain schedule is missing", () => {
    expect(() =>
      validateStartupConfig({
        DATABASE_URL: "postgresql://app:password@localhost/valdoc",
        JWT_SECRET: "super-long-test-secret-0123456789",
        CUSTOMER_ID: "qa-org",
        ORG_NAME: "QA Organization",
        NODE_ENV: "production",
        MALWARE_SCANNER_PROVIDER: "clamav",
        BACKUP_ENCRYPTION_KEY: "super-long-backup-encryption-key-0123456789",
        RATE_LIMIT_BACKEND: "gateway"
      })
    ).toThrow(/AUDIT_CHAIN_VERIFY_CRON/);
  });
});
