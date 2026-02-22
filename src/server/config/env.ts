type RawEnv = Record<string, string | undefined>;

export type RequiredEnv = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  CUSTOMER_ID: string;
  ORG_NAME: string;
};

const requiredKeys: Array<keyof RequiredEnv> = ["DATABASE_URL", "JWT_SECRET", "CUSTOMER_ID", "ORG_NAME"];
const insecureSecretValues = new Set([
  "changeme",
  "change-me",
  "replace-me",
  "replace-with-long-random-secret",
  "default",
  "password",
  "secret"
]);
const insecureMinioDefaults = new Set(["minioadmin", "admin", "password", "changeme"]);

const isTrue = (value: string | undefined) => (value ?? "").trim().toLowerCase() === "true";
const toPositiveIntOr = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const assertStrongSecret = (name: string, value: string | undefined, minLength = 32) => {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }
  if (normalized.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters.`);
  }
  if (insecureSecretValues.has(normalized.toLowerCase())) {
    throw new Error(`${name} uses an insecure placeholder value.`);
  }
};

export const validateRequiredEnv = (raw: RawEnv): RequiredEnv => {
  const missing: string[] = [];
  const normalized = {} as RequiredEnv;

  for (const key of requiredKeys) {
    const value = raw[key]?.trim();
    if (!value) {
      missing.push(key);
      continue;
    }
    normalized[key] = value;
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const jwtSecret = normalized.JWT_SECRET.trim();
  if (jwtSecret.length < 32) {
    throw new Error("Invalid JWT_SECRET: must be at least 32 characters.");
  }

  if (insecureSecretValues.has(jwtSecret.toLowerCase())) {
    throw new Error("Invalid JWT_SECRET: insecure placeholder value is not allowed.");
  }

  return normalized;
};

export const getRequiredEnv = () => validateRequiredEnv(process.env);

export const validateStartupConfig = (raw: RawEnv, log: (line: string) => void = console.info) => {
  const env = validateRequiredEnv(raw);
  const isProduction = (raw.NODE_ENV ?? "").trim().toLowerCase() === "production";
  const openSearchEnabled = isTrue(raw.ENABLE_OPENSEARCH);
  const openSearchSecurityDisabled = isTrue(raw.OPENSEARCH_SECURITY_DISABLED);
  const openSearchUrl = (raw.OPENSEARCH_URL ?? "").trim();
  const openSearchUsername = (raw.OPENSEARCH_USERNAME ?? "").trim();
  const openSearchPassword = (raw.OPENSEARCH_PASSWORD ?? "").trim();
  const minioRootUser = (raw.MINIO_ROOT_USER ?? "").trim();
  const minioRootPassword = (raw.MINIO_ROOT_PASSWORD ?? "").trim();
  const rateLimitBackend = (raw.RATE_LIMIT_BACKEND ?? "memory").trim().toLowerCase();
  const redisRestUrl = (raw.REDIS_REST_URL ?? "").trim();
  const redisRestToken = (raw.REDIS_REST_TOKEN ?? "").trim();
  const malwareScannerProvider = (raw.MALWARE_SCANNER_PROVIDER ?? "stub").trim().toLowerCase();
  const managedMalwareUrl = (raw.MANAGED_MALWARE_SCAN_URL ?? "").trim();
  const managedMalwareToken = (raw.MANAGED_MALWARE_SCAN_TOKEN ?? "").trim();
  const sessionMaxAgeSeconds = toPositiveIntOr(raw.SESSION_MAX_AGE_SECONDS, 8 * 60 * 60);
  const idleTimeoutSeconds = toPositiveIntOr(raw.SESSION_IDLE_TIMEOUT_SECONDS, 30 * 60);

  if (isProduction && openSearchEnabled && openSearchSecurityDisabled) {
    throw new Error("OpenSearch security must be enabled in production (OPENSEARCH_SECURITY_DISABLED cannot be true).");
  }
  if (isProduction && openSearchEnabled && !openSearchUrl.startsWith("https://")) {
    throw new Error("OpenSearch URL must use https:// in production.");
  }
  if (isProduction && openSearchEnabled && (!openSearchUsername || !openSearchPassword)) {
    throw new Error("OpenSearch credentials are required in production when indexing is enabled.");
  }
  if (isProduction && openSearchEnabled) {
    assertStrongSecret("OPENSEARCH_PASSWORD", openSearchPassword, 16);
  }
  if (isProduction) {
    assertStrongSecret("BACKUP_ENCRYPTION_KEY", raw.BACKUP_ENCRYPTION_KEY, 32);
    if (!["redis", "gateway"].includes(rateLimitBackend)) {
      throw new Error("RATE_LIMIT_BACKEND must be set to 'redis' or 'gateway' in production.");
    }
    if (rateLimitBackend === "redis") {
      if (!redisRestUrl.startsWith("https://")) {
        throw new Error("REDIS_REST_URL must use https:// when RATE_LIMIT_BACKEND=redis in production.");
      }
      assertStrongSecret("REDIS_REST_TOKEN", redisRestToken, 20);
    }
    if (malwareScannerProvider === "stub") {
      throw new Error("MALWARE_SCANNER_PROVIDER cannot be 'stub' in production.");
    }
    if (!["clamav", "managed"].includes(malwareScannerProvider)) {
      throw new Error("MALWARE_SCANNER_PROVIDER must be 'clamav' or 'managed' in production.");
    }
    if (malwareScannerProvider === "managed") {
      if (!managedMalwareUrl.startsWith("https://")) {
        throw new Error("MANAGED_MALWARE_SCAN_URL must use https:// in production.");
      }
      assertStrongSecret("MANAGED_MALWARE_SCAN_TOKEN", managedMalwareToken, 20);
    }
    if (
      minioRootUser &&
      minioRootPassword &&
      (insecureMinioDefaults.has(minioRootUser.toLowerCase()) || insecureMinioDefaults.has(minioRootPassword.toLowerCase()))
    ) {
      throw new Error("MinIO default credentials are not allowed in production.");
    }
    if (sessionMaxAgeSeconds > 24 * 60 * 60) {
      throw new Error("SESSION_MAX_AGE_SECONDS exceeds production maximum of 86400 seconds.");
    }
  }
  if (idleTimeoutSeconds > sessionMaxAgeSeconds) {
    throw new Error("SESSION_IDLE_TIMEOUT_SECONDS must be less than or equal to SESSION_MAX_AGE_SECONDS.");
  }

  log(`Config validation executed for organization: ${env.ORG_NAME} (${env.CUSTOMER_ID}).`);
  return env;
};
