import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminGate } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth-server";

export const ADMIN_GATE_ROW_ID = "default";
export const ADMIN_GATE_COOKIE = "clinic_admin_gate";
const GRANT_TTL_MS = 8 * 60 * 60 * 1000;

function envSigningSecret(): string | null {
  const candidates = [
    process.env.ADMIN_GATE_SECRET,
    process.env.HEALTH_CHECK_SECRET,
    import.meta.env.ADMIN_GATE_SECRET,
    import.meta.env.HEALTH_CHECK_SECRET,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function signWithSecret(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Server secret for signing unlock cookies — stored in DB if env is not set. */
async function getGateSigningSecret(): Promise<string> {
  const fromEnv = envSigningSecret();
  if (fromEnv) return fromEnv;

  const row = await db
    .select({ cookieSecret: adminGate.cookieSecret })
    .from(adminGate)
    .where(eq(adminGate.id, ADMIN_GATE_ROW_ID))
    .limit(1);

  if (row[0]?.cookieSecret) return row[0].cookieSecret;

  const generated = randomBytes(32).toString("base64url");
  const existing = await db
    .select({ id: adminGate.id })
    .from(adminGate)
    .where(eq(adminGate.id, ADMIN_GATE_ROW_ID))
    .limit(1);

  if (existing[0]) {
    await db
      .update(adminGate)
      .set({ cookieSecret: generated })
      .where(eq(adminGate.id, ADMIN_GATE_ROW_ID));
  }

  return generated;
}

export function adminGateCookieHeader(
  token: string,
  maxAgeSeconds: number,
): string {
  const parts = [
    `${ADMIN_GATE_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (import.meta.env.PROD) parts.push("Secure");
  return parts.join("; ");
}

export function clearAdminGateCookieHeader(): string {
  const parts = [
    `${ADMIN_GATE_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (import.meta.env.PROD) parts.push("Secure");
  return parts.join("; ");
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, decodeURIComponent(rest.join("="))];
    }),
  );
}

export async function createAdminGateGrant(userId: string): Promise<{
  token: string;
  maxAge: number;
}> {
  const secret = await getGateSigningSecret();
  const exp = Date.now() + GRANT_TTL_MS;
  const payload = `${userId}.${exp}`;
  return {
    token: `${payload}.${signWithSecret(payload, secret)}`,
    maxAge: Math.floor(GRANT_TTL_MS / 1000),
  };
}

export async function hasValidAdminGateGrant(
  request: Request,
  userId: string,
): Promise<boolean> {
  const token = parseCookies(request.headers.get("cookie"))[ADMIN_GATE_COOKIE];
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  if (uid !== userId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const payload = `${uid}.${expStr}`;
  const secret = await getGateSigningSecret();
  const expected = signWithSecret(payload, secret);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const GATE_CONFIG_TTL_MS = 30_000;
let gateConfigCache: {
  at: number;
  value: { configured: boolean; updatedAt: Date | null };
} | null = null;

export function invalidateAdminGateConfigCache(): void {
  gateConfigCache = null;
}

export async function getAdminGateConfig(): Promise<{
  configured: boolean;
  updatedAt: Date | null;
}> {
  const now = Date.now();
  if (gateConfigCache && now - gateConfigCache.at < GATE_CONFIG_TTL_MS) {
    return gateConfigCache.value;
  }

  const row = await db
    .select({
      codeHash: adminGate.codeHash,
      updatedAt: adminGate.updatedAt,
    })
    .from(adminGate)
    .where(eq(adminGate.id, ADMIN_GATE_ROW_ID))
    .limit(1);
  if (!row[0]?.codeHash) {
    const value = { configured: false, updatedAt: null };
    gateConfigCache = { at: now, value };
    return value;
  }
  const value = {
    configured: true,
    updatedAt:
      row[0].updatedAt instanceof Date
        ? row[0].updatedAt
        : new Date(row[0].updatedAt as number),
  };
  gateConfigCache = { at: now, value };
  return value;
}

export async function setAdminGateCode(
  plainCode: string,
  updatedByUserId: string,
): Promise<void> {
  const codeHash = hashPassword(plainCode);
  let cookieSecret = envSigningSecret();
  if (!cookieSecret) {
    const row = await db
      .select({ cookieSecret: adminGate.cookieSecret })
      .from(adminGate)
      .where(eq(adminGate.id, ADMIN_GATE_ROW_ID))
      .limit(1);
    cookieSecret = row[0]?.cookieSecret ?? randomBytes(32).toString("base64url");
  }
  const now = new Date();
  const existing = await db
    .select({ id: adminGate.id })
    .from(adminGate)
    .where(eq(adminGate.id, ADMIN_GATE_ROW_ID))
    .limit(1);
  if (existing[0]) {
    await db
      .update(adminGate)
      .set({ codeHash, cookieSecret, updatedAt: now, updatedByUserId })
      .where(eq(adminGate.id, ADMIN_GATE_ROW_ID));
  } else {
    await db.insert(adminGate).values({
      id: ADMIN_GATE_ROW_ID,
      codeHash,
      cookieSecret,
      updatedAt: now,
      updatedByUserId,
    });
  }
  invalidateAdminGateConfigCache();
}

export async function verifyAdminGateCode(plainCode: string): Promise<boolean> {
  const row = await db
    .select({ codeHash: adminGate.codeHash })
    .from(adminGate)
    .where(eq(adminGate.id, ADMIN_GATE_ROW_ID))
    .limit(1);
  if (!row[0]?.codeHash) return false;
  return verifyPassword(plainCode, row[0].codeHash);
}

/** Paths reachable before Admin II exists or passcode is configured. */
export function pathExemptFromAdminIISetup(pathname: string): boolean {
  if (pathname === "/admin/setup-admin-ii") return true;
  if (pathname === "/api/admin/bootstrap-admin-ii") return true;
  return false;
}

/** Paths where Admin I must enter the administration passcode. */
export function pathRequiresAdminIGate(pathname: string): boolean {
  if (pathExemptFromAdminIISetup(pathname)) return false;
  if (pathname === "/admin/unlock") return false;
  if (pathname.startsWith("/api/admin/gate")) return false;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/api/users")) return true;
  if (pathname.startsWith("/api/catalog")) return true;
  if (pathname.startsWith("/api/correction-requests")) return true;
  if (pathname.startsWith("/api/role-elevation-requests")) return true;
  if (pathname.startsWith("/api/audit-logs")) return true;
  if (pathname === "/api/admin/pending-requests-count") return true;
  return false;
}

export function adminIGateRequired(
  role: string | undefined,
  pathname: string,
): boolean {
  return role === "ADMIN_I" && pathRequiresAdminIGate(pathname);
}
