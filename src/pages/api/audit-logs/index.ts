import type { APIRoute } from "astro";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { rowToAuditPublic } from "@/lib/audit-log";
import {
  canManageUsers,
  canUseAdvancedAdmin,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = forbidUnless(
    canManageUsers(locals.userRole) || canUseAdvancedAdmin(locals.userRole),
  );
  if (denied) return denied;

  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const offsetRaw = Number(url.searchParams.get("offset") ?? "0");
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500);
  const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);

  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return json({ logs: rows.map(rowToAuditPublic) });
};
