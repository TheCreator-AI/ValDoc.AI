export const isUnsafeMethod = (method: string) => {
  const normalized = method.toUpperCase();
  return normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE";
};

const normalizeHost = (value: string | null) => (value ?? "").trim().toLowerCase();

const extractHost = (urlValue: string | null) => {
  if (!urlValue) return null;
  try {
    const parsed = new URL(urlValue);
    return parsed.host.toLowerCase();
  } catch {
    return null;
  }
};

export const isSameOriginRequestAllowed = (params: {
  method: string;
  host: string | null;
  origin: string | null;
  referer: string | null;
}) => {
  if (!isUnsafeMethod(params.method)) return true;
  const host = normalizeHost(params.host);
  if (!host) return false;

  const originHost = extractHost(params.origin);
  if (originHost) {
    return originHost === host;
  }

  const refererHost = extractHost(params.referer);
  if (refererHost) {
    return refererHost === host;
  }

  return false;
};
