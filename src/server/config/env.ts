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
  log(`Config validation executed for organization: ${env.ORG_NAME} (${env.CUSTOMER_ID}).`);
  return env;
};
