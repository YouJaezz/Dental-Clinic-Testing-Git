import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { visits } from "@/db/schema";
import { loadVisitPaymentReceipt } from "@/lib/visit-payment-receipt";

export type VisitDeletePreview = {
  visitId: string;
  patientId: string;
  visitDate: string;
  status: "OPEN" | "CLOSED";
  procedureCount: number;
  paymentCount: number;
  chargesCents: number;
  paidCents: number;
  balanceCents: number;
};

export async function loadVisitDeletePreview(
  visitId: string,
): Promise<VisitDeletePreview | null> {
  const row = await db
    .select({
      id: visits.id,
      patientId: visits.patientId,
      visitDate: visits.visitDate,
      status: visits.status,
    })
    .from(visits)
    .where(eq(visits.id, visitId))
    .limit(1);
  const v = row[0];
  if (!v) return null;

  const receipt = await loadVisitPaymentReceipt(visitId);
  const visitDate =
    v.visitDate instanceof Date
      ? v.visitDate.toISOString()
      : new Date(v.visitDate).toISOString();

  return {
    visitId: v.id,
    patientId: v.patientId,
    visitDate,
    status: v.status as "OPEN" | "CLOSED",
    procedureCount: receipt?.summary.chargeLines.length ?? 0,
    paymentCount: receipt?.summary.payments.length ?? 0,
    chargesCents: receipt?.summary.chargesCents ?? 0,
    paidCents: receipt?.summary.paidCents ?? 0,
    balanceCents: receipt?.summary.balanceCents ?? 0,
  };
}

export async function deleteVisitById(visitId: string): Promise<boolean> {
  const deleted = await db
    .delete(visits)
    .where(eq(visits.id, visitId))
    .returning({ id: visits.id });
  return deleted.length > 0;
}
