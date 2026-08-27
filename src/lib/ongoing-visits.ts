import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { activeProcedureLine } from "@/lib/procedure-line-filters";
import { db } from "@/db/client";
import {
  patients,
  procedureCatalog,
  visitPayments,
  visitProcedureLines,
  visits,
} from "@/db/schema";
import { formatManilaDateLong, toManilaDateKey } from "@/lib/manila-date";

export type OngoingVisitSort = "oldest" | "balance" | "activity";

export type OngoingVisitRow = {
  visitId: string;
  ticketNumber: number;
  patientId: string;
  patientName: string;
  contactNumber: string | null;
  visitDate: string;
  visitDateLabel: string;
  daysOpen: number;
  /** Distinct catalog procedures on this visit (shows quantity when more than one unit). */
  procedureSummary: string;
  /** Visit notes plus procedure line notes, when present. */
  notesSummary: string | null;
  chargesCents: number;
  paidCents: number;
  balanceCents: number;
  procedureLineCount: number;
  lastActivityAt: string | null;
  lastPaymentAt: string | null;
};

export type OngoingVisitsSummary = {
  openCount: number;
  chargesCents: number;
  paidCents: number;
  balanceCents: number;
};

/** Active catalog entries for the procedure filter dropdown. */
export type OngoingVisitCatalogOption = {
  id: string;
  name: string;
  code: string | null;
};

export type OngoingVisitsReport = {
  timezone: "Asia/Manila";
  sort: OngoingVisitSort;
  /** When set, only visits that include this catalog procedure (non-voided line). */
  catalogFilterId: string | null;
  catalogFilterOptions: OngoingVisitCatalogOption[];
  summary: OngoingVisitsSummary;
  visits: OngoingVisitRow[];
};

function asDate(v: Date | number): Date {
  return v instanceof Date ? v : new Date(v);
}

function patientName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

/** Whole calendar days between visit date and today (Manila). */
export function daysOpenManila(visitDate: Date): number {
  const startKey = toManilaDateKey(visitDate);
  const todayKey = toManilaDateKey(new Date());
  const start = new Date(`${startKey}T12:00:00+08:00`);
  const end = new Date(`${todayKey}T12:00:00+08:00`);
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 86_400_000),
  );
}

function parseSort(raw: string | null | undefined): OngoingVisitSort {
  if (raw === "balance" || raw === "activity") return raw;
  return "oldest";
}

function sortVisits(
  rows: OngoingVisitRow[],
  sort: OngoingVisitSort,
): OngoingVisitRow[] {
  const copy = [...rows];
  if (sort === "balance") {
    copy.sort((a, b) => b.balanceCents - a.balanceCents);
    return copy;
  }
  if (sort === "activity") {
    copy.sort((a, b) => {
      const at = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bt = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return bt - at;
    });
    return copy;
  }
  copy.sort((a, b) => b.daysOpen - a.daysOpen);
  return copy;
}

function mergeVisitNotes(
  visitNotes: string | null | undefined,
  lineNotePieces: string[],
): string | null {
  const chunks: string[] = [];
  const seen = new Set<string>();
  const vn = visitNotes?.trim();
  if (vn) {
    chunks.push(vn);
    seen.add(vn);
  }
  for (const raw of lineNotePieces) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    chunks.push(t);
    seen.add(t);
  }
  return chunks.length ? chunks.join("\n\n") : null;
}

function formatProcedureSummary(
  byCatalogId: Map<string, { name: string; qty: number }>,
): string {
  const rows = [...byCatalogId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  if (rows.length === 0) return "";
  return rows
    .map((r) => (r.qty > 1 ? `${r.name} ×${r.qty}` : r.name))
    .join("; ");
}

function normalizeCatalogFilterId(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  return t ? t : null;
}

export async function buildOngoingVisitsReport(
  sortParam?: string | null,
  catalogIdParam?: string | null,
): Promise<OngoingVisitsReport> {
  const sort = parseSort(sortParam);
  const requestedCatalogId = normalizeCatalogFilterId(catalogIdParam);

  const catalogFilterOptions = await db
    .select({
      id: procedureCatalog.id,
      name: procedureCatalog.name,
      code: procedureCatalog.code,
    })
    .from(procedureCatalog)
    .where(eq(procedureCatalog.active, true))
    .orderBy(asc(procedureCatalog.name));

  let effectiveCatalogFilterId: string | null = null;
  if (requestedCatalogId) {
    const exists = catalogFilterOptions.some((c) => c.id === requestedCatalogId);
    if (exists) effectiveCatalogFilterId = requestedCatalogId;
  }

  let visitRows = await db
    .select({
      visitId: visits.id,
      ticketNumber: visits.ticketNumber,
      patientId: visits.patientId,
      visitDate: visits.visitDate,
      notes: visits.notes,
      createdAt: visits.createdAt,
      firstName: patients.firstName,
      lastName: patients.lastName,
      contactNumber: patients.contactNumber,
    })
    .from(visits)
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .where(and(eq(visits.status, "OPEN"), isNull(patients.deletedAt)))
    .orderBy(desc(visits.visitDate));

  if (effectiveCatalogFilterId && visitRows.length > 0) {
    const openIds = visitRows.map((v) => v.visitId);
    const withProcedure = await db
      .select({ visitId: visitProcedureLines.visitId })
      .from(visitProcedureLines)
      .where(
        and(
          eq(visitProcedureLines.catalogId, effectiveCatalogFilterId),
          activeProcedureLine(),
          inArray(visitProcedureLines.visitId, openIds),
        ),
      )
      .groupBy(visitProcedureLines.visitId);
    const allowed = new Set(withProcedure.map((r) => r.visitId));
    visitRows = visitRows.filter((v) => allowed.has(v.visitId));
  }

  const visitIds = visitRows.map((v) => v.visitId);
  const chargesByVisit = new Map<string, number>();
  const lineCountByVisit = new Map<string, number>();
  const lastLineAtByVisit = new Map<string, number>();
  const proceduresByVisit = new Map<
    string,
    Map<string, { name: string; qty: number }>
  >();
  const lineNotesByVisit = new Map<string, string[]>();
  const paidByVisit = new Map<string, number>();
  const lastPaymentAtByVisit = new Map<string, number>();

  if (visitIds.length > 0) {
    const lines = await db
      .select({
        visitId: visitProcedureLines.visitId,
        catalogId: visitProcedureLines.catalogId,
        quantity: visitProcedureLines.quantity,
        lineTotalCents: visitProcedureLines.lineTotalCents,
        createdAt: visitProcedureLines.createdAt,
        catalogName: procedureCatalog.name,
        lineNotes: visitProcedureLines.lineNotes,
      })
      .from(visitProcedureLines)
      .innerJoin(
        procedureCatalog,
        eq(visitProcedureLines.catalogId, procedureCatalog.id),
      )
      .where(
        and(
          inArray(visitProcedureLines.visitId, visitIds),
          activeProcedureLine(),
        ),
      )
      .orderBy(desc(visitProcedureLines.createdAt));

    for (const line of lines) {
      chargesByVisit.set(
        line.visitId,
        (chargesByVisit.get(line.visitId) ?? 0) + line.lineTotalCents,
      );
      lineCountByVisit.set(
        line.visitId,
        (lineCountByVisit.get(line.visitId) ?? 0) + 1,
      );
      const t = asDate(line.createdAt).getTime();
      const prev = lastLineAtByVisit.get(line.visitId) ?? 0;
      if (t > prev) lastLineAtByVisit.set(line.visitId, t);

      let procMap = proceduresByVisit.get(line.visitId);
      if (!procMap) {
        procMap = new Map();
        proceduresByVisit.set(line.visitId, procMap);
      }
      const prevProc = procMap.get(line.catalogId) ?? {
        name: line.catalogName,
        qty: 0,
      };
      prevProc.qty += line.quantity;
      procMap.set(line.catalogId, prevProc);

      const ln = line.lineNotes?.trim();
      if (ln) {
        const arr = lineNotesByVisit.get(line.visitId) ?? [];
        arr.push(ln);
        lineNotesByVisit.set(line.visitId, arr);
      }
    }

    const pays = await db
      .select({
        visitId: visitPayments.visitId,
        amountCents: visitPayments.amountCents,
        recordedAt: visitPayments.recordedAt,
      })
      .from(visitPayments)
      .where(
        and(
          inArray(visitPayments.visitId, visitIds),
          eq(visitPayments.status, "COMPLETED"),
        ),
      );

    for (const pay of pays) {
      paidByVisit.set(
        pay.visitId,
        (paidByVisit.get(pay.visitId) ?? 0) + pay.amountCents,
      );
      const t = asDate(pay.recordedAt).getTime();
      const prev = lastPaymentAtByVisit.get(pay.visitId) ?? 0;
      if (t > prev) lastPaymentAtByVisit.set(pay.visitId, t);
    }
  }

  const rows: OngoingVisitRow[] = visitRows.map((v) => {
    const visitD = asDate(v.visitDate);
    const chargesCents = chargesByVisit.get(v.visitId) ?? 0;
    const paidCents = paidByVisit.get(v.visitId) ?? 0;
    const createdMs = asDate(v.createdAt).getTime();
    const lastLineMs = lastLineAtByVisit.get(v.visitId) ?? 0;
    const lastPayMs = lastPaymentAtByVisit.get(v.visitId) ?? 0;
    const lastActivityMs = Math.max(createdMs, lastLineMs, lastPayMs);

    const procMap = proceduresByVisit.get(v.visitId);
    const procedureSummary = procMap ? formatProcedureSummary(procMap) : "";
    const notesSummary = mergeVisitNotes(
      v.notes,
      lineNotesByVisit.get(v.visitId) ?? [],
    );

    const ymd = toManilaDateKey(visitD);
    return {
      visitId: v.visitId,
      ticketNumber: v.ticketNumber ?? 0,
      patientId: v.patientId,
      patientName: patientName(v.firstName, v.lastName),
      contactNumber: v.contactNumber,
      visitDate: visitD.toISOString(),
      visitDateLabel: formatManilaDateLong(ymd),
      daysOpen: daysOpenManila(visitD),
      procedureSummary,
      notesSummary,
      chargesCents,
      paidCents,
      balanceCents: chargesCents - paidCents,
      procedureLineCount: lineCountByVisit.get(v.visitId) ?? 0,
      lastActivityAt:
        lastActivityMs > 0 ? new Date(lastActivityMs).toISOString() : null,
      lastPaymentAt:
        lastPayMs > 0 ? new Date(lastPayMs).toISOString() : null,
    };
  });

  const sorted = sortVisits(rows, sort);
  let chargesCents = 0;
  let paidCents = 0;
  for (const r of sorted) {
    chargesCents += r.chargesCents;
    paidCents += r.paidCents;
  }

  return {
    timezone: "Asia/Manila",
    sort,
    catalogFilterId: effectiveCatalogFilterId,
    catalogFilterOptions,
    summary: {
      openCount: sorted.length,
      chargesCents,
      paidCents,
      balanceCents: chargesCents - paidCents,
    },
    visits: sorted,
  };
}
