type RawEnv = Record<string, string | undefined>;

export type DeploymentReadinessCheck = {
  key:
    | "database_posture"
    | "rate_limit_backend"
    | "malware_scanner"
    | "audit_chain_schedule"
    | "backup_encryption"
    | "opensearch_security"
    | "minio_defaults";
  status: "pass" | "warn" | "fail";
  message: string;
};

export type DeploymentReadiness = {
  ready: boolean;
  environment: "production" | "non-production";
  checks: DeploymentReadinessCheck[];
};

const isTrue = (value: string | undefined) => (value ?? "").trim().toLowerCase() === "true";
const isProduction = (value: string | undefined) => (value ?? "").trim().toLowerCase() === "production";
const isHttpsUrl = (value: string | undefined) => (value ?? "").trim().toLowerCase().startsWith("https://");
const isStrongSecret = (value: string | undefined, minLength: number) => (value ?? "").trim().length >= minLength;

const insecureMinioDefaults = new Set(["minioadmin", "admin", "password", "changeme"]);

export const getDeploymentReadiness = (raw: RawEnv = process.env): DeploymentReadiness => {
  const production = isProduction(raw.NODE_ENV);
  const checks: DeploymentReadinessCheck[] = [];

  const databaseUrl = (raw.DATABASE_URL ?? "").trim().toLowerCase();
  const postgresReady = databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://");
  checks.push({
    key: "database_posture",
    status: production && !postgresReady ? "fail" : postgresReady ? "pass" : "warn",
    message: postgresReady
      ? "Database uses PostgreSQL posture."
      : production
        ? "Production requires PostgreSQL deployment posture."
        : "Non-production database is permitted for development."
  });

  const rateLimitBackend = (raw.RATE_LIMIT_BACKEND ?? "memory").trim().toLowerCase();
  const redisConfigured =
    isHttpsUrl(raw.REDIS_REST_URL) && isStrongSecret(raw.REDIS_REST_TOKEN, 20) && rateLimitBackend === "redis";
  const gatewayConfigured = rateLimitBackend === "gateway";
  const rateLimitPass = gatewayConfigured || redisConfigured;
  checks.push({
    key: "rate_limit_backend",
    status: production && !rateLimitPass ? "fail" : rateLimitPass ? "pass" : "warn",
    message: rateLimitPass
      ? `Rate limiting backend is ${rateLimitBackend}.`
      : production
        ? "Production requires RATE_LIMIT_BACKEND=gateway or redis with secure Redis credentials."
        : "Development fallback rate limiting is enabled."
  });

  const scanner = (raw.MALWARE_SCANNER_PROVIDER ?? "stub").trim().toLowerCase();
  const managedReady =
    scanner === "managed" && isHttpsUrl(raw.MANAGED_MALWARE_SCAN_URL) && isStrongSecret(raw.MANAGED_MALWARE_SCAN_TOKEN, 20);
  const clamavReady = scanner === "clamav";
  const scannerPass = managedReady || clamavReady;
  checks.push({
    key: "malware_scanner",
    status: production && !scannerPass ? "fail" : scannerPass ? "pass" : "warn",
    message: scannerPass
      ? `Malware scanner provider is ${scanner}.`
      : production
        ? "Production requires MALWARE_SCANNER_PROVIDER=clamav or managed with secure URL/token."
        : "Development scanner provider may remain stub."
  });

  const hasAuditSchedule = (raw.AUDIT_CHAIN_VERIFY_CRON ?? "").trim().length > 0;
  checks.push({
    key: "audit_chain_schedule",
    status: production && !hasAuditSchedule ? "fail" : hasAuditSchedule ? "pass" : "warn",
    message: hasAuditSchedule
      ? "Audit-chain verification schedule is configured."
      : production
        ? "Production requires AUDIT_CHAIN_VERIFY_CRON for scheduled tamper-evidence verification."
        : "Set AUDIT_CHAIN_VERIFY_CRON when preparing production automation."
  });

  const backupKeyStrong = isStrongSecret(raw.BACKUP_ENCRYPTION_KEY, 32);
  checks.push({
    key: "backup_encryption",
    status: production && !backupKeyStrong ? "fail" : backupKeyStrong ? "pass" : "warn",
    message: backupKeyStrong
      ? "Backup encryption key length is acceptable."
      : production
        ? "Production requires BACKUP_ENCRYPTION_KEY with at least 32 characters."
        : "Backup encryption key should be configured before production."
  });

  const openSearchEnabled = isTrue(raw.ENABLE_OPENSEARCH);
  const openSearchSecure =
    !openSearchEnabled ||
    (isHttpsUrl(raw.OPENSEARCH_URL) &&
      !isTrue(raw.OPENSEARCH_SECURITY_DISABLED) &&
      (raw.OPENSEARCH_USERNAME ?? "").trim().length > 0 &&
      isStrongSecret(raw.OPENSEARCH_PASSWORD, 16));
  checks.push({
    key: "opensearch_security",
    status: production && !openSearchSecure ? "fail" : openSearchSecure ? "pass" : "warn",
    message: openSearchSecure
      ? "OpenSearch security posture is acceptable."
      : production
        ? "OpenSearch must use TLS, credentials, and security plugin in production."
        : "OpenSearch security checks apply when indexing is enabled."
  });

  const minioUser = (raw.MINIO_ROOT_USER ?? "").trim().toLowerCase();
  const minioPass = (raw.MINIO_ROOT_PASSWORD ?? "").trim().toLowerCase();
  const minioUnsafe =
    Boolean(minioUser && insecureMinioDefaults.has(minioUser)) ||
    Boolean(minioPass && insecureMinioDefaults.has(minioPass));
  checks.push({
    key: "minio_defaults",
    status: production && minioUnsafe ? "fail" : minioUnsafe ? "warn" : "pass",
    message: minioUnsafe
      ? "MinIO defaults detected; rotate credentials."
      : "No insecure MinIO default credentials detected."
  });

  const failed = checks.some((check) => check.status === "fail");
  return {
    ready: !failed,
    environment: production ? "production" : "non-production",
    checks
  };
};
