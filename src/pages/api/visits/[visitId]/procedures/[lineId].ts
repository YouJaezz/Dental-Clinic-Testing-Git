import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { visitProcedureLines, visits } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canMutateClinicalData,
  canVoidClosedProcedureLines,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import { voidProcedureLine } from "@/lib/procedure-void";

export const DELETE: APIRoute = async ({ params, locals }) => {
  const visitId = params.visitId;
  const lineId = params.lineId;
  if (!visitId || !lineId) {
    return json({ error: "Missing visitId or lineId" }, { status: 400 });
  }

  const visitRow = await db
    .select({ status: visits.status })
    .from(visits)
    .where(eq(visits.id, visitId))
    .limit(1);
  if (!visitRow[0]) return json({ error: "Not found" }, { status: 404 });

  const isAdmin = canVoidClosedProcedureLines(locals.userRole);

  if (visitRow[0].status === "CLOSED") {
    if (!isAdmin) {
      return json(
        {
          error:
            "Visit is closed. Ask an administrator to remove this line, or submit a correction request.",
        },
        { status: 400 },
      );
    }
    const voidResult = await voidProcedureLine({
      visitId,
      lineId,
      category: "ERROR",
      reason: "Removed by administrator from closed visit (recorded in error).",
      actor: auditActorFromLocals(locals),
      requireClosedVisit: true,
    });
    if ("error" in voidResult) {
      return json({ error: voidResult.error }, { status: voidResult.status });
    }
    return json({
      ok: true,
      voided: true,
      category: voidResult.category,
    });
  }

  const denied = forbidUnless(canMutateClinicalData(locals.userRole));
  if (denied) return denied;

  const removed = await db
    .delete(visitProcedureLines)
    .where(
      and(
        eq(visitProcedureLines.id, lineId),
        eq(visitProcedureLines.visitId, visitId),
      ),
    )
    .returning({ id: visitProcedureLines.id });

  if (!removed[0]) {
    return json({ error: "Procedure line not found" }, { status: 404 });
  }

  await recordAudit(auditActorFromLocals(locals), {
    action: "procedure.removed",
    entityType: "visit",
    entityId: visitId,
    summary: `Removed procedure line ${lineId} from open visit ${visitId}`,
  });
  return json({ ok: true }, { status: 200 });
};
