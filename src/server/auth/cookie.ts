type SessionCookieOptions = {
  token: string;
  maxAgeSeconds: number;
};

const isProduction = () => process.env.NODE_ENV === "production";

const buildCookie = (parts: string[]) => parts.join("; ");

export const buildSessionCookieHeader = (options: SessionCookieOptions) => {
  const parts = [
    `valdoc_token=${options.token}`,
    "HttpOnly",
    "Path=/",
    `SameSite=${isProduction() ? "Strict" : "Lax"}`,
    `Max-Age=${options.maxAgeSeconds}`
  ];
  if (isProduction()) {
    parts.push("Secure");
  }
  return buildCookie(parts);
};

export const buildSessionClearCookieHeader = () => {
  const parts = [
    "valdoc_token=",
    "HttpOnly",
    "Path=/",
    `SameSite=${isProduction() ? "Strict" : "Lax"}`,
    "Max-Age=0"
  ];
  if (isProduction()) {
    parts.push("Secure");
  }
  return buildCookie(parts);
};

