import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";

export type AuditActor = {
  userId?: string | null;
  userEmail?: string | null;
};

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
};

export type AuditLogPublic = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  details: Record<string, unknown> | null;
};

function iso(d: Date | number): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export async function recordAudit(
  actor: AuditActor,
  entry: AuditEntry,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: actor.userId ?? null,
      actorEmail: actor.userEmail ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      detailsJson:
        entry.details && Object.keys(entry.details).length > 0
          ? JSON.stringify(entry.details)
          : null,
    });
  } catch (e) {
    console.error("[audit] failed to record", entry.action, e);
  }
}

export function auditActorFromLocals(locals: App.Locals): AuditActor {
  return {
    userId: locals.userId ?? null,
    userEmail: locals.userEmail ?? null,
  };
}

export function rowToAuditPublic(row: typeof auditLogs.$inferSelect): AuditLogPublic {
  let details: Record<string, unknown> | null = null;
  if (row.detailsJson) {
    try {
      details = JSON.parse(row.detailsJson) as Record<string, unknown>;
    } catch {
      details = null;
    }
  }
  return {
    id: row.id,
    createdAt: iso(row.createdAt),
    actorUserId: row.actorUserId,
    actorEmail: row.actorEmail,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    details,
  };
}
