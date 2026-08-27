import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  procedureCatalog,
  type ProcedureVoidCategory,
  visitProcedureLines,
  visits,
} from "@/db/schema";
import type { AuditActor } from "@/lib/audit-log";
import { recordAudit } from "@/lib/audit-log";
import { isMissingSchemaError } from "@/lib/db-errors";
import { activeProcedureLine } from "@/lib/procedure-line-filters";
import {
  formatVoidReason,
  voidCategoryLabel,
} from "@/lib/procedure-void-label";

export type VoidProcedureResult =
  | { ok: true; lineId: string; catalogName: string; category: ProcedureVoidCategory }
  | { error: string; status: number };

/**
 * Void a procedure line. Row stays in DB for audit/print; excluded from charge totals.
 * Payments (daily sales cash) are unchanged.
 */
export async function voidProcedureLine(params: {
  visitId: string;
  lineId: string;
  category: ProcedureVoidCategory;
  reason?: string;
  actor: AuditActor;
  requireClosedVisit?: boolean;
}): Promise<VoidProcedureResult> {
  const visitRow = await db
    .select({ status: visits.status, patientId: visits.patientId })
    .from(visits)
    .where(eq(visits.id, params.visitId))
    .limit(1);
  if (!visitRow[0]) {
    return { error: "Visit not found", status: 404 };
  }
  if (params.requireClosedVisit !== false && visitRow[0].status !== "CLOSED") {
    return {
      error: "Only lines on closed visits can be voided this way",
      status: 400,
    };
  }

  const lineRow = await db
    .select({
      id: visitProcedureLines.id,
      voidedAt: visitProcedureLines.voidedAt,
      lineTotalCents: visitProcedureLines.lineTotalCents,
      catalogName: procedureCatalog.name,
    })
    .from(visitProcedureLines)
    .innerJoin(
      procedureCatalog,
      eq(visitProcedureLines.catalogId, procedureCatalog.id),
    )
    .where(
      and(
        eq(visitProcedureLines.id, params.lineId),
        eq(visitProcedureLines.visitId, params.visitId),
      ),
    )
    .limit(1);

  if (!lineRow[0]) {
    return { error: "Procedure line not found", status: 404 };
  }
  if (lineRow[0].voidedAt != null) {
    return { error: "Procedure line is already removed", status: 400 };
  }

  const voidReason = formatVoidReason(params.category, params.reason);
  const now = new Date();
  const voidPatch = {
    voidedAt: now,
    voidedByUserId: params.actor.userId ?? null,
    voidReason,
  };

  try {
    await db
      .update(visitProcedureLines)
      .set(voidPatch)
      .where(
        and(
          eq(visitProcedureLines.id, params.lineId),
          activeProcedureLine(),
        ),
      );
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    return {
      error:
        "Database is missing void columns. Stop the dev server and run: npm run db:fix-schema",
      status: 503,
    };
  }

  const label = voidCategoryLabel(params.category);
  await recordAudit(params.actor, {
    action: "procedure.voided",
    entityType: "visit",
    entityId: params.visitId,
    summary: `Procedure voided (${label}): ${lineRow[0].catalogName} — ₱${(lineRow[0].lineTotalCents / 100).toFixed(2)}`,
    details: {
      lineId: params.lineId,
      lineTotalCents: lineRow[0].lineTotalCents,
      voidCategory: params.category,
      reason: voidReason,
      patientId: visitRow[0].patientId,
    },
  });

  return {
    ok: true,
    lineId: params.lineId,
    catalogName: lineRow[0].catalogName,
    category: params.category,
  };
}
