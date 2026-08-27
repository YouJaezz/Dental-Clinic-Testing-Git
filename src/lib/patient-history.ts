import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { isMissingSchemaError } from "@/lib/db-errors";
import { parseVoidCategory } from "@/lib/procedure-void-label";
import { db } from "@/db/client";
import {
  patients,
  procedureCatalog,
  visitPayments,
  visitProcedureLines,
  visits,
} from "@/db/schema";
import { patientRowToPublic } from "@/lib/patient-dto";
import { parseToothNumbersJson } from "@/lib/teeth";

export type PatientHistoryLine = {
  id: string;
  visitId: string;
  quantity: number;
  unitPriceCentsSnapshot: number;
  lineTotalCents: number;
  createdAt: string;
  catalogName: string;
  catalogCode: string | null;
  procedureLevelLabelSnapshot: string | null;
  toothNumbers: number[] | null;
  lineNotes: string | null;
  voided: boolean;
  voidCategory: "ERROR" | "REFUNDED" | null;
  voidReason: string | null;
};

export type PatientHistoryPayment = {
  id: string;
  amountCents: number;
  method: string;
  status: string;
  reference: string | null;
  recordedAt: string;
};

export type PatientHistoryVisitBlock = {
  visit: {
    id: string;
    visitDate: string;
    status: string;
    ticketNumber: number;
    notes: string | null;
  };
  summary: {
    chargesCents: number;
    paidCents: number;
    balanceCents: number;
  };
  procedureLines: PatientHistoryLine[];
  payments: PatientHistoryPayment[];
};

export type PatientHistoryPayload = {
  /** All visits for patient when response is limited (for “older visits” UI). */
  totalVisitCount?: number;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    contactNumber: string | null;
    dateOfBirth: string | null;
    age: number | null;
    gender: string | null;
    civilStatus: string | null;
    address: string | null;
    medicalHistory: string | null;
    notes: string | null;
  };
  visits: PatientHistoryVisitBlock[];
  totals: {
    chargesCents: number;
    paidCents: number;
    balanceCents: number;
  };
};

function iso(d: Date | number): string {
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
}

type HistoryLineRow = {
  id: string;
  visitId: string;
  quantity: number;
  unitPriceCentsSnapshot: number;
  lineTotalCents: number;
  createdAt: Date | number;
  catalogName: string;
  catalogCode: string | null;
  procedureLevelLabelSnapshot: string | null;
  toothNumbersJson: string | null;
  lineNotes: string | null;
  voidedAt: Date | number | null;
  voidReason: string | null;
};

const baseLineSelect = {
  id: visitProcedureLines.id,
  visitId: visitProcedureLines.visitId,
  quantity: visitProcedureLines.quantity,
  unitPriceCentsSnapshot: visitProcedureLines.unitPriceCentsSnapshot,
  lineTotalCents: visitProcedureLines.lineTotalCents,
  createdAt: visitProcedureLines.createdAt,
  catalogName: procedureCatalog.name,
  catalogCode: procedureCatalog.code,
  procedureLevelLabelSnapshot:
    visitProcedureLines.procedureLevelLabelSnapshot,
  toothNumbersJson: visitProcedureLines.toothNumbersJson,
  lineNotes: visitProcedureLines.lineNotes,
};

async function loadProcedureLinesForVisits(
  visitIds: string[],
): Promise<Map<string, HistoryLineRow[]>> {
  const byVisit = new Map<string, HistoryLineRow[]>();
  if (visitIds.length === 0) return byVisit;

  let rows: HistoryLineRow[];
  try {
    rows = await db
      .select({
        ...baseLineSelect,
        voidedAt: visitProcedureLines.voidedAt,
        voidReason: visitProcedureLines.voidReason,
      })
      .from(visitProcedureLines)
      .innerJoin(
        procedureCatalog,
        eq(visitProcedureLines.catalogId, procedureCatalog.id),
      )
      .where(inArray(visitProcedureLines.visitId, visitIds))
      .orderBy(desc(visitProcedureLines.createdAt));
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    const plain = await db
      .select(baseLineSelect)
      .from(visitProcedureLines)
      .innerJoin(
        procedureCatalog,
        eq(visitProcedureLines.catalogId, procedureCatalog.id),
      )
      .where(inArray(visitProcedureLines.visitId, visitIds))
      .orderBy(desc(visitProcedureLines.createdAt));
    rows = plain.map((row) => ({
      ...row,
      voidedAt: null,
      voidReason: null,
    }));
  }

  for (const row of rows) {
    const list = byVisit.get(row.visitId) ?? [];
    list.push(row);
    byVisit.set(row.visitId, list);
  }
  return byVisit;
}

export type LoadPatientHistoryOptions = {
  /** Max visits to return (newest first). Totals still reflect all visits. */
  visitLimit?: number;
};

export async function loadPatientHistory(
  patientId: string,
  options?: LoadPatientHistoryOptions,
): Promise<PatientHistoryPayload | null> {
  const pRow = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
    .limit(1);
  const p = pRow[0];
  if (!p) return null;

  const allVisitRows = await db
    .select()
    .from(visits)
    .where(eq(visits.patientId, patientId))
    .orderBy(desc(visits.visitDate));

  const limit = options?.visitLimit;
  const visitRows =
    limit != null && limit > 0 ? allVisitRows.slice(0, limit) : allVisitRows;

  const idsForDetail =
    limit != null && limit > 0
      ? visitRows.map((v) => v.id)
      : allVisitRows.map((v) => v.id);

  const [linesByVisit, allPayments] = await Promise.all([
    loadProcedureLinesForVisits(idsForDetail),
    idsForDetail.length > 0
      ? db
          .select()
          .from(visitPayments)
          .where(inArray(visitPayments.visitId, idsForDetail))
          .orderBy(desc(visitPayments.recordedAt))
      : Promise.resolve([]),
  ]);

  const paymentsByVisit = new Map<string, typeof allPayments>();
  for (const pay of allPayments) {
    const list = paymentsByVisit.get(pay.visitId) ?? [];
    list.push(pay);
    paymentsByVisit.set(pay.visitId, list);
  }

  let totalCharges = 0;
  let totalPaid = 0;

  function buildBlock(v: (typeof visitRows)[0]): PatientHistoryVisitBlock {
    const lines = linesByVisit.get(v.id) ?? [];
    const payments = paymentsByVisit.get(v.id) ?? [];
    const chargesCents = lines
      .filter((r) => r.voidedAt == null)
      .reduce((s, r) => s + r.lineTotalCents, 0);
    const paidCents = payments
      .filter((x) => x.status === "COMPLETED")
      .reduce((s, r) => s + r.amountCents, 0);
    return {
      visit: {
        id: v.id,
        visitDate: iso(v.visitDate),
        status: v.status,
        ticketNumber: v.ticketNumber ?? 0,
        notes: v.notes,
      },
      summary: {
        chargesCents,
        paidCents,
        balanceCents: chargesCents - paidCents,
      },
      procedureLines: lines.map((row) => ({
        id: row.id,
        visitId: row.visitId,
        quantity: row.quantity,
        unitPriceCentsSnapshot: row.unitPriceCentsSnapshot,
        lineTotalCents: row.lineTotalCents,
        createdAt: iso(row.createdAt),
        catalogName: row.catalogName,
        catalogCode: row.catalogCode,
        procedureLevelLabelSnapshot: row.procedureLevelLabelSnapshot,
        toothNumbers: parseToothNumbersJson(row.toothNumbersJson),
        lineNotes: row.lineNotes,
        voided: row.voidedAt != null,
        voidCategory: row.voidedAt != null
          ? parseVoidCategory(row.voidReason)
          : null,
        voidReason: row.voidReason,
      })),
      payments: payments.map((pay) => ({
        id: pay.id,
        amountCents: pay.amountCents,
        method: pay.method,
        status: pay.status,
        reference: pay.reference,
        recordedAt: iso(pay.recordedAt),
      })),
    };
  }

  const totalsSource =
    limit != null && limit > 0 ? visitRows : allVisitRows;
  for (const v of totalsSource) {
    const lines = linesByVisit.get(v.id) ?? [];
    const payments = paymentsByVisit.get(v.id) ?? [];
    totalCharges += lines
      .filter((r) => r.voidedAt == null)
      .reduce((s, r) => s + r.lineTotalCents, 0);
    totalPaid += payments
      .filter((x) => x.status === "COMPLETED")
      .reduce((s, r) => s + r.amountCents, 0);
  }

  return {
    patient: patientRowToPublic(p),
    ...(limit != null && limit > 0
      ? { totalVisitCount: allVisitRows.length }
      : {}),
    visits: visitRows.map(buildBlock),
    totals: {
      chargesCents: totalCharges,
      paidCents: totalPaid,
      balanceCents: totalCharges - totalPaid,
    },
  };
}
