import { and, desc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { activeProcedureLine } from "@/lib/procedure-line-filters";
import { isMissingSchemaError } from "@/lib/db-errors";
import {
  parseVoidCategory,
  voidCategoryLabel,
} from "@/lib/procedure-void-label";
import {
  patients,
  procedureCatalog,
  users,
  visitPayments,
  visitProcedureLines,
  visits,
} from "@/db/schema";
import {
  formatManilaDateLong,
  manilaDayBoundsMs,
  toManilaDateKey,
} from "@/lib/manila-date";
import { daysOpenManila } from "@/lib/ongoing-visits";

export type DailySalesPaymentRow = {
  id: string;
  visitId: string;
  patientName: string;
  amountCents: number;
  method: string;
  recordedAt: string;
  reference: string | null;
};

export type DailySalesVisitRow = {
  visitId: string;
  patientName: string;
  chargesCents: number;
  paidCents: number;
  balanceCents: number;
  collectedTodayCents: number;
};

export type DailySalesByMethod = {
  method: string;
  count: number;
  amountCents: number;
};

/** Procedure lines voided on the report date (removed from totals; cash unchanged). */
export type DailySalesVoidedLineRow = {
  lineId: string;
  visitId: string;
  patientName: string;
  catalogName: string;
  lineTotalCents: number;
  category: "ERROR" | "REFUNDED";
  categoryLabel: string;
  voidedAt: string;
  voidReason: string | null;
  voidedByEmail: string | null;
  visitDateLabel: string;
};

export type ExistingBalanceRow = {
  visitId: string;
  patientId: string;
  patientName: string;
  visitDate: string;
  visitDateLabel: string;
  status: "OPEN" | "CLOSED";
  daysOpen: number;
  chargesCents: number;
  paidCents: number;
  balanceCents: number;
  collectedOnReportDateCents: number;
};

export type DailySalesReport = {
  timezone: "Asia/Manila";
  date: string;
  dateLabel: string;
  todayKey: string;
  canPickDate: boolean;
  collectedCents: number;
  paymentCount: number;
  byMethod: DailySalesByMethod[];
  visitCount: number;
  chargesCents: number;
  paidOnVisitsCents: number;
  balanceOnVisitsCents: number;
  existingBalanceCents: number;
  existingBalanceVisitCount: number;
  existingBalances: ExistingBalanceRow[];
  payments: DailySalesPaymentRow[];
  visits: DailySalesVisitRow[];
  voidedLines: DailySalesVoidedLineRow[];
  voidedLineCount: number;
  voidedChargesCents: number;
};

function asDate(v: Date | number): Date {
  return v instanceof Date ? v : new Date(v);
}

function patientName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

function methodLabel(method: string): string {
  const m = method.trim().toLowerCase();
  if (m === "cash") return "Cash";
  if (m === "card") return "Card";
  if (m === "check") return "Check";
  if (m === "other") return "Other";
  return method.trim() || "Other";
}

export function resolveDailySalesDate(
  requested: string | null | undefined,
  canPickDate: boolean,
): { date: string } | { error: string } {
  const todayKey = toManilaDateKey(new Date());
  if (!canPickDate) {
    return { date: todayKey };
  }
  const raw = requested?.trim();
  if (!raw) {
    return { date: todayKey };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { error: "Invalid date (use yyyy-MM-dd)" };
  }
  if (manilaDayBoundsMs(raw) == null) {
    return { error: "Invalid date" };
  }
  return { date: raw };
}

async function loadVisitFinancials(visitIds: string[]) {
  const chargesByVisit = new Map<string, number>();
  const paidByVisit = new Map<string, number>();

  if (visitIds.length === 0) {
    return { chargesByVisit, paidByVisit };
  }

  let lines: { visitId: string; lineTotalCents: number }[];
  try {
    lines = await db
      .select({
        visitId: visitProcedureLines.visitId,
        lineTotalCents: visitProcedureLines.lineTotalCents,
      })
      .from(visitProcedureLines)
      .where(
        and(
          inArray(visitProcedureLines.visitId, visitIds),
          activeProcedureLine(),
        ),
      );
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    lines = await db
      .select({
        visitId: visitProcedureLines.visitId,
        lineTotalCents: visitProcedureLines.lineTotalCents,
      })
      .from(visitProcedureLines)
      .where(inArray(visitProcedureLines.visitId, visitIds));
  }

  for (const line of lines) {
    chargesByVisit.set(
      line.visitId,
      (chargesByVisit.get(line.visitId) ?? 0) + line.lineTotalCents,
    );
  }

  const pays = await db
    .select({
      visitId: visitPayments.visitId,
      amountCents: visitPayments.amountCents,
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
  }

  return { chargesByVisit, paidByVisit };
}

async function loadVoidedLinesOnDate(
  start: Date,
  end: Date,
): Promise<DailySalesVoidedLineRow[]> {
  try {
    const rows = await db
      .select({
        lineId: visitProcedureLines.id,
        visitId: visitProcedureLines.visitId,
        lineTotalCents: visitProcedureLines.lineTotalCents,
        voidedAt: visitProcedureLines.voidedAt,
        voidReason: visitProcedureLines.voidReason,
        catalogName: procedureCatalog.name,
        firstName: patients.firstName,
        lastName: patients.lastName,
        visitDate: visits.visitDate,
        voidedByEmail: users.email,
      })
      .from(visitProcedureLines)
      .innerJoin(visits, eq(visitProcedureLines.visitId, visits.id))
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .innerJoin(
        procedureCatalog,
        eq(visitProcedureLines.catalogId, procedureCatalog.id),
      )
      .leftJoin(users, eq(visitProcedureLines.voidedByUserId, users.id))
      .where(
        and(
          isNull(patients.deletedAt),
          isNotNull(visitProcedureLines.voidedAt),
          gte(visitProcedureLines.voidedAt, start),
          lte(visitProcedureLines.voidedAt, end),
        ),
      )
      .orderBy(desc(visitProcedureLines.voidedAt));

    return rows.map((r) => {
      const category = parseVoidCategory(r.voidReason) ?? "ERROR";
      const visitD = asDate(r.visitDate);
      const visitYmd = toManilaDateKey(visitD);
      return {
        lineId: r.lineId,
        visitId: r.visitId,
        patientName: patientName(r.firstName, r.lastName),
        catalogName: r.catalogName,
        lineTotalCents: r.lineTotalCents,
        category,
        categoryLabel: voidCategoryLabel(category),
        voidedAt: r.voidedAt
          ? asDate(r.voidedAt).toISOString()
          : new Date().toISOString(),
        voidReason: r.voidReason,
        voidedByEmail: r.voidedByEmail,
        visitDateLabel: formatManilaDateLong(visitYmd),
      };
    });
  } catch (e) {
    if (isMissingSchemaError(e)) return [];
    throw e;
  }
}

export async function buildDailySalesReport(
  dateYmd: string,
  canPickDate: boolean,
): Promise<DailySalesReport | { error: string }> {
  const bounds = manilaDayBoundsMs(dateYmd);
  if (!bounds) {
    return { error: "Invalid date" };
  }

  const start = new Date(bounds.startMs);
  const end = new Date(bounds.endMs);
  const todayKey = toManilaDateKey(new Date());

  const paymentRows = await db
    .select({
      id: visitPayments.id,
      visitId: visitPayments.visitId,
      amountCents: visitPayments.amountCents,
      method: visitPayments.method,
      recordedAt: visitPayments.recordedAt,
      reference: visitPayments.reference,
      firstName: patients.firstName,
      lastName: patients.lastName,
    })
    .from(visitPayments)
    .innerJoin(visits, eq(visitPayments.visitId, visits.id))
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .where(
      and(
        isNull(patients.deletedAt),
        eq(visitPayments.status, "COMPLETED"),
        gte(visitPayments.recordedAt, start),
        lte(visitPayments.recordedAt, end),
      ),
    )
    .orderBy(desc(visitPayments.recordedAt));

  const visitRows = await db
    .select({
      visitId: visits.id,
      firstName: patients.firstName,
      lastName: patients.lastName,
    })
    .from(visits)
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .where(
      and(
        isNull(patients.deletedAt),
        gte(visits.visitDate, start),
        lte(visits.visitDate, end),
      ),
    )
    .orderBy(desc(visits.visitDate));

  const visitIds = visitRows.map((v) => v.visitId);
  const collectedTodayByVisit = new Map<string, number>();

  for (const p of paymentRows) {
    collectedTodayByVisit.set(
      p.visitId,
      (collectedTodayByVisit.get(p.visitId) ?? 0) + p.amountCents,
    );
  }

  const { chargesByVisit, paidByVisit } = await loadVisitFinancials(visitIds);

  const methodMap = new Map<string, { count: number; amountCents: number }>();
  let collectedCents = 0;
  const payments: DailySalesPaymentRow[] = [];

  for (const p of paymentRows) {
    collectedCents += p.amountCents;
    const label = methodLabel(p.method);
    const cur = methodMap.get(label) ?? { count: 0, amountCents: 0 };
    cur.count += 1;
    cur.amountCents += p.amountCents;
    methodMap.set(label, cur);
    payments.push({
      id: p.id,
      visitId: p.visitId,
      patientName: patientName(p.firstName, p.lastName),
      amountCents: p.amountCents,
      method: label,
      recordedAt: asDate(p.recordedAt).toISOString(),
      reference: p.reference,
    });
  }

  const byMethod: DailySalesByMethod[] = [...methodMap.entries()]
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.amountCents - a.amountCents);

  let chargesCents = 0;
  let paidOnVisitsCents = 0;
  const visitDetails: DailySalesVisitRow[] = [];

  for (const v of visitRows) {
    const charges = chargesByVisit.get(v.visitId) ?? 0;
    const paid = paidByVisit.get(v.visitId) ?? 0;
    const collectedToday = collectedTodayByVisit.get(v.visitId) ?? 0;
    chargesCents += charges;
    paidOnVisitsCents += paid;
    visitDetails.push({
      visitId: v.visitId,
      patientName: patientName(v.firstName, v.lastName),
      chargesCents: charges,
      paidCents: paid,
      balanceCents: charges - paid,
      collectedTodayCents: collectedToday,
    });
  }

  const visitsWithCharges = await db
    .selectDistinct({ visitId: visitProcedureLines.visitId })
    .from(visitProcedureLines)
    .innerJoin(visits, eq(visitProcedureLines.visitId, visits.id))
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .where(isNull(patients.deletedAt));

  const visitsWithPayments = await db
    .selectDistinct({ visitId: visitPayments.visitId })
    .from(visitPayments)
    .innerJoin(visits, eq(visitPayments.visitId, visits.id))
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .where(
      and(isNull(patients.deletedAt), eq(visitPayments.status, "COMPLETED")),
    );

  const financialVisitIdSet = new Set<string>();
  for (const r of visitsWithCharges) financialVisitIdSet.add(r.visitId);
  for (const r of visitsWithPayments) financialVisitIdSet.add(r.visitId);
  const financialVisitIds = [...financialVisitIdSet];

  const allFinancials = await loadVisitFinancials(financialVisitIds);

  const allVisitRows =
    financialVisitIds.length === 0
      ? []
      : await db
          .select({
            visitId: visits.id,
            patientId: visits.patientId,
            visitDate: visits.visitDate,
            status: visits.status,
            firstName: patients.firstName,
            lastName: patients.lastName,
          })
          .from(visits)
          .innerJoin(patients, eq(visits.patientId, patients.id))
          .where(
            and(
              isNull(patients.deletedAt),
              inArray(visits.id, financialVisitIds),
            ),
          )
          .orderBy(desc(visits.visitDate));
  const existingBalances: ExistingBalanceRow[] = [];
  let existingBalanceCents = 0;

  for (const v of allVisitRows) {
    const charges = allFinancials.chargesByVisit.get(v.visitId) ?? 0;
    const paid = allFinancials.paidByVisit.get(v.visitId) ?? 0;
    const balance = charges - paid;
    if (balance <= 0) continue;

    const visitD = asDate(v.visitDate);
    const ymd = toManilaDateKey(visitD);
    existingBalanceCents += balance;
    existingBalances.push({
      visitId: v.visitId,
      patientId: v.patientId,
      patientName: patientName(v.firstName, v.lastName),
      visitDate: visitD.toISOString(),
      visitDateLabel: formatManilaDateLong(ymd),
      status: v.status as "OPEN" | "CLOSED",
      daysOpen: daysOpenManila(visitD),
      chargesCents: charges,
      paidCents: paid,
      balanceCents: balance,
      collectedOnReportDateCents: collectedTodayByVisit.get(v.visitId) ?? 0,
    });
  }

  existingBalances.sort((a, b) => b.balanceCents - a.balanceCents);

  const voidedLines = await loadVoidedLinesOnDate(start, end);
  const voidedChargesCents = voidedLines.reduce(
    (s, r) => s + r.lineTotalCents,
    0,
  );

  return {
    timezone: "Asia/Manila",
    date: dateYmd,
    dateLabel: formatManilaDateLong(dateYmd),
    todayKey,
    canPickDate,
    collectedCents,
    paymentCount: paymentRows.length,
    byMethod,
    visitCount: visitRows.length,
    chargesCents,
    paidOnVisitsCents,
    balanceOnVisitsCents: chargesCents - paidOnVisitsCents,
    existingBalanceCents,
    existingBalanceVisitCount: existingBalances.length,
    existingBalances,
    payments,
    visits: visitDetails,
    voidedLines,
    voidedLineCount: voidedLines.length,
    voidedChargesCents,
  };
}
