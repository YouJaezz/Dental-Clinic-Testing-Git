import type { APIRoute } from "astro";
import { desc, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { canUseAdvancedAdmin, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ locals }) => {
  const denied = forbidUnless(canUseAdvancedAdmin(locals.userRole));
  if (denied) return denied;

  const now = new Date();
  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      email: users.email,
      role: users.role,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
      deviceLabel: sessions.deviceLabel,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(gt(sessions.expiresAt, now))
    .orderBy(desc(sessions.createdAt))
    .limit(200);

  return json({
    sessions: rows.map((r) => ({
      ...r,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date(r.createdAt).toISOString(),
      expiresAt:
        r.expiresAt instanceof Date
          ? r.expiresAt.toISOString()
          : new Date(r.expiresAt).toISOString(),
    })),
  });
};
