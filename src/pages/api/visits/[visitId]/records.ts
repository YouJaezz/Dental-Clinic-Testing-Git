import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { activeProcedureLine } from "@/lib/procedure-line-filters";
import { db } from "@/db/client";
import {
  procedureCatalog,
  visitPayments,
  visitProcedureLines,
  visits,
} from "@/db/schema";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";
import { parseToothNumbersJson } from "@/lib/teeth";

export const GET: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const visitId = params.visitId;
  if (!visitId) return json({ error: "Missing visitId" }, { status: 400 });

  const v = await db
    .select()
    .from(visits)
    .where(eq(visits.id, visitId))
    .limit(1);
  if (!v[0]) return json({ error: "Not found" }, { status: 404 });

  const lines = await db
    .select({
      id: visitProcedureLines.id,
      quantity: visitProcedureLines.quantity,
      unitPriceCentsSnapshot: visitProcedureLines.unitPriceCentsSnapshot,
      lineTotalCents: visitProcedureLines.lineTotalCents,
      createdAt: visitProcedureLines.createdAt,
      catalogId: procedureCatalog.id,
      catalogCode: procedureCatalog.code,
      catalogName: procedureCatalog.name,
      procedureLevelLabelSnapshot:
        visitProcedureLines.procedureLevelLabelSnapshot,
      toothNumbersJson: visitProcedureLines.toothNumbersJson,
      lineNotes: visitProcedureLines.lineNotes,
    })
    .from(visitProcedureLines)
    .innerJoin(
      procedureCatalog,
      eq(visitProcedureLines.catalogId, procedureCatalog.id),
    )
    .where(
      and(eq(visitProcedureLines.visitId, visitId), activeProcedureLine()),
    )
    .orderBy(desc(visitProcedureLines.createdAt));

  const payments = await db
    .select()
    .from(visitPayments)
    .where(eq(visitPayments.visitId, visitId))
    .orderBy(desc(visitPayments.recordedAt));

  return json({
    visit: v[0],
    procedureLines: lines.map(
      ({ toothNumbersJson, ...rest }) => ({
        ...rest,
        toothNumbers: parseToothNumbersJson(toothNumbersJson),
      }),
    ),
    payments,
  });
};
