import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { canDeleteAuditLogs, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canDeleteAuditLogs(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const row = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.id, id))
    .limit(1);
  if (!row[0]) return json({ error: "Not found" }, { status: 404 });

  await db.delete(auditLogs).where(eq(auditLogs.id, id));

  await recordAudit(auditActorFromLocals(locals), {
    action: "audit.deleted",
    entityType: "audit_log",
    entityId: id,
    summary: `Deleted audit entry: ${row[0].summary}`,
    details: { deletedAction: row[0].action },
  });

  return json({ ok: true });
};
