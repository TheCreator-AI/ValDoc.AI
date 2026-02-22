const parsePositiveInt = (raw: string | undefined, fallback: number) => {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

export type AuthPolicy = {
  lockoutThreshold: number;
  passwordMaxAgeDays: number;
  sessionMaxAgeSeconds: number;
  idleTimeoutSeconds: number;
  requireAdminMfa: boolean;
  requirePrivilegedMfa: boolean;
};

export const getAuthPolicy = (): AuthPolicy => {
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";
  const requirePrivilegedMfaRaw = process.env.REQUIRE_PRIVILEGED_MFA;
  const requirePrivilegedMfa =
    requirePrivilegedMfaRaw === undefined ? isProduction : requirePrivilegedMfaRaw.toLowerCase() === "true";
  return {
    lockoutThreshold: parsePositiveInt(process.env.AUTH_LOCKOUT_THRESHOLD, 10),
    passwordMaxAgeDays: parsePositiveInt(process.env.PASSWORD_MAX_AGE_DAYS, 180),
    sessionMaxAgeSeconds: parsePositiveInt(process.env.SESSION_MAX_AGE_SECONDS, 8 * 60 * 60),
    idleTimeoutSeconds: parsePositiveInt(process.env.SESSION_IDLE_TIMEOUT_SECONDS, 30 * 60),
    requireAdminMfa: (process.env.REQUIRE_ADMIN_MFA ?? "false").toLowerCase() === "true",
    requirePrivilegedMfa
  };
};
