import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  patients,
  procedureCatalog,
  visitPayments,
  visitProcedureLines,
  visits,
} from "@/db/schema";
import { activeProcedureLine } from "@/lib/procedure-line-filters";
import { patientRowToPublic } from "@/lib/patient-dto";
import type { Summary } from "@/lib/clinical-types";

function asIso(d: Date | number): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export type VisitPaymentReceiptData = {
  patient: ReturnType<typeof patientRowToPublic>;
  summary: Summary;
  visitNotes: string | null;
};

export async function loadVisitPaymentReceipt(
  visitId: string,
): Promise<VisitPaymentReceiptData | null> {
  const visitRow = await db
    .select({
      id: visits.id,
      patientId: visits.patientId,
      visitDate: visits.visitDate,
      status: visits.status,
      notes: visits.notes,
    })
    .from(visits)
    .where(eq(visits.id, visitId))
    .limit(1);
  const v = visitRow[0];
  if (!v) return null;

  const pRow = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, v.patientId), isNull(patients.deletedAt)))
    .limit(1);
  if (!pRow[0]) return null;

  const lines = await db
    .select({
      id: visitProcedureLines.id,
      quantity: visitProcedureLines.quantity,
      lineTotalCents: visitProcedureLines.lineTotalCents,
      createdAt: visitProcedureLines.createdAt,
      catalogName: procedureCatalog.name,
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

  const paymentRows = await db
    .select({
      id: visitPayments.id,
      amountCents: visitPayments.amountCents,
      method: visitPayments.method,
      reference: visitPayments.reference,
      recordedAt: visitPayments.recordedAt,
    })
    .from(visitPayments)
    .where(
      and(
        eq(visitPayments.visitId, visitId),
        eq(visitPayments.status, "COMPLETED"),
      ),
    )
    .orderBy(desc(visitPayments.recordedAt));

  const chargesCents = lines.reduce((s, r) => s + r.lineTotalCents, 0);
  const paidCents = paymentRows.reduce((s, r) => s + r.amountCents, 0);

  const visitNotes = v.notes?.trim() ? v.notes.trim() : null;

  return {
    patient: patientRowToPublic(pRow[0]),
    visitNotes,
    summary: {
      visitId,
      visitDate: asIso(v.visitDate),
      visitStatus: v.status as "OPEN" | "CLOSED",
      chargesCents,
      paidCents,
      balanceCents: chargesCents - paidCents,
      chargeLines: lines.map((r) => ({
        id: r.id,
        catalogName: r.catalogName,
        quantity: r.quantity,
        lineTotalCents: r.lineTotalCents,
        createdAt: asIso(r.createdAt),
      })),
      payments: paymentRows.map((r) => ({
        id: r.id,
        amountCents: r.amountCents,
        method: r.method,
        reference: r.reference,
        recordedAt: asIso(r.recordedAt),
      })),
    },
  };
}
