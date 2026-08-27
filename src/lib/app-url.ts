function readAppHost(): string | null {
  const candidates = [process.env.APP_HOST, import.meta.env.APP_HOST];
  for (const raw of candidates) {
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

/** Normalize APP_HOST to host[:port] (no scheme or path). */
export function normalizeAppHost(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  if (trimmed.includes("://")) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
      return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    } catch {
      return null;
    }
  }

  if (trimmed.includes("/")) return null;

  return trimmed;
}

/** Origin for absolute links; uses APP_HOST when set, else the request origin. */
export function getAppOrigin(requestUrl: URL): URL {
  const configured = readAppHost();
  if (!configured) return new URL(requestUrl.origin);

  const host = normalizeAppHost(configured);
  if (!host) return new URL(requestUrl.origin);

  return new URL(`${requestUrl.protocol}//${host}`);
}

export function getRegistrationIntakeUrl(requestUrl: URL): string {
  return new URL("/register", getAppOrigin(requestUrl)).href;
}
