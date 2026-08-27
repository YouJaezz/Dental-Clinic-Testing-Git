import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users, type UserRole } from "@/db/schema";
import { isDeviceBlocked } from "@/lib/device-block";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/session";

export type SessionUser = {
  userId: string;
  email: string;
  role: UserRole;
};

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 12);
}

export function verifyPassword(plain: string, passwordHash: string): boolean {
  return bcrypt.compareSync(plain, passwordHash);
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

export async function getSessionUserFromRequest(
  request: Request,
): Promise<SessionUser | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;

  const now = new Date();
  const row = await db
    .select({
      userId: sessions.userId,
      email: users.email,
      role: users.role,
      ipAddress: sessions.ipAddress,
      deviceLabel: sessions.deviceLabel,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .limit(1);

  const session = row[0];
  if (!session) return null;

  if (
    await isDeviceBlocked({
      ipAddress: session.ipAddress,
      deviceLabel: session.deviceLabel,
    })
  ) {
    await deleteSession(sessionId);
    return null;
  }

  return {
    userId: session.userId,
    email: session.email,
    role: session.role,
  };
}

export type SessionMeta = {
  userAgent?: string | null;
  ipAddress?: string | null;
  deviceLabel?: string | null;
};

export async function createSession(
  userId: string,
  meta?: SessionMeta,
): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const id = crypto.randomUUID();
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt,
    userAgent: meta?.userAgent ?? null,
    ipAddress: meta?.ipAddress ?? null,
    deviceLabel: meta?.deviceLabel ?? null,
  });
  return id;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function sessionCookieHeader(
  sessionId: string,
  maxAgeSeconds: number,
): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (import.meta.env.PROD) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearSessionCookieHeader(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (import.meta.env.PROD) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function getSessionIdFromRequest(request: Request): string | null {
  const cookies = parseCookies(request.headers.get("cookie"));
  const id = cookies[SESSION_COOKIE];
  return id || null;
}
