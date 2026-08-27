import type { APIRoute } from "astro";
import { and, eq, gte, inArray, isNull, lte, max, min } from "drizzle-orm";
import { db } from "@/db/client";
import { activeProcedureLine } from "@/lib/procedure-line-filters";
import {
  patients,
  visitPayments,
  visitProcedureLines,
  visits,
} from "@/db/schema";
import { canViewAnalytics, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";
import {
  manilaCalendarMonth,
  manilaCalendarYear,
  manilaYearBounds,
  manilaYearFromInstant,
} from "@/lib/manila-date";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function asDate(v: Date | number): Date {
  return v instanceof Date ? v : new Date(v);
}

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = forbidUnless(canViewAnalytics(locals.userRole));
  if (denied) return denied;

  const yearParam = url.searchParams.get("year")?.trim();

  const [boundsRow] = await db
    .select({
      minD: min(visits.visitDate),
      maxD: max(visits.visitDate),
    })
    .from(visits);

  const now = new Date();
  const currentY = manilaCalendarYear(now);

  let yMin = currentY;
  let yMax = currentY;
  if (boundsRow?.minD != null) {
    yMin = manilaYearFromInstant(asDate(boundsRow.minD));
  }
  if (boundsRow?.maxD != null) {
    yMax = manilaYearFromInstant(asDate(boundsRow.maxD));
  }
  if (yMin > yMax) [yMin, yMax] = [yMax, yMin];

  const availableYears: number[] = [];
  for (let y = yMax; y >= yMin; y--) {
    availableYears.push(y);
  }
  if (availableYears.length === 0) {
    availableYears.push(currentY);
  }

  if (!yearParam) {
    return json({ availableYears });
  }

  const year = Number.parseInt(yearParam, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return json({ error: "Invalid year", availableYears }, { status: 400 });
  }

  const { start, end } = manilaYearBounds(year);

  const visitRows = await db
    .select({
      visitId: visits.id,
      visitDate: visits.visitDate,
      patientId: visits.patientId,
      age: patients.age,
      gender: patients.gender,
      civilStatus: patients.civilStatus,
    })
    .from(visits)
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .where(
      and(
        isNull(patients.deletedAt),
        gte(visits.visitDate, start),
        lte(visits.visitDate, end),
      ),
    );

  const visitIdToMonth = new Map<string, number>();
  for (const row of visitRows) {
    const vd = asDate(row.visitDate);
    visitIdToMonth.set(row.visitId, manilaCalendarMonth(vd));
  }

  const patientDemo = new Map<
    string,
    { age: number | null; gender: string | null; civilStatus: string | null }
  >();
  for (const row of visitRows) {
    if (!patientDemo.has(row.patientId)) {
      patientDemo.set(row.patientId, {
        age: row.age,
        gender: row.gender,
        civilStatus: row.civilStatus,
      });
    }
  }

  const ageBuckets = new Map<string, number>();
  for (const { age } of patientDemo.values()) {
    const key = age == null ? "Unknown" : String(age);
    ageBuckets.set(key, (ageBuckets.get(key) ?? 0) + 1);
  }

  const genderBuckets = new Map<string, number>();
  for (const { gender } of patientDemo.values()) {
    const g = gender?.trim();
    const key = g && g.length > 0 ? g : "Unspecified";
    genderBuckets.set(key, (genderBuckets.get(key) ?? 0) + 1);
  }

  const visitIds = [...visitIdToMonth.keys()];
  const chargesByMonth = Array.from({ length: 12 }, () => 0);
  const collectedByMonth = Array.from({ length: 12 }, () => 0);
  const visitsByMonth = Array.from({ length: 12 }, () => 0);

  for (const [, m] of visitIdToMonth) {
    if (m >= 1 && m <= 12) visitsByMonth[m - 1] += 1;
  }

  if (visitIds.length > 0) {
    const lines = await db
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

    for (const ln of lines) {
      const m = visitIdToMonth.get(ln.visitId);
      if (m != null && m >= 1 && m <= 12) {
        chargesByMonth[m - 1] += ln.lineTotalCents;
      }
    }

    const payments = await db
      .select({
        visitId: visitPayments.visitId,
        amountCents: visitPayments.amountCents,
        status: visitPayments.status,
      })
      .from(visitPayments)
      .where(
        and(
          inArray(visitPayments.visitId, visitIds),
          eq(visitPayments.status, "COMPLETED"),
        ),
      );

    for (const pay of payments) {
      const m = visitIdToMonth.get(pay.visitId);
      if (m != null && m >= 1 && m <= 12) {
        collectedByMonth[m - 1] += pay.amountCents;
      }
    }
  }

  const ageDistribution = [...ageBuckets.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (a.label === "Unknown") return 1;
      if (b.label === "Unknown") return -1;
      const na = Number.parseInt(a.label, 10);
      const nb = Number.parseInt(b.label, 10);
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    });

  const genderDistribution = [...genderBuckets.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const civilStatusBuckets = new Map<string, number>();
  for (const { civilStatus } of patientDemo.values()) {
    const c = civilStatus?.trim();
    const key = c && c.length > 0 ? c : "Unspecified";
    civilStatusBuckets.set(key, (civilStatusBuckets.get(key) ?? 0) + 1);
  }

  const civilStatusDistribution = [...civilStatusBuckets.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const monthly = MONTH_LABELS.map((monthLabel, i) => ({
    month: i + 1,
    monthLabel,
    visitCount: visitsByMonth[i],
    chargesCents: chargesByMonth[i],
    collectedCents: collectedByMonth[i],
  }));

  const totalsCharges = chargesByMonth.reduce((s, x) => s + x, 0);
  const totalsCollected = collectedByMonth.reduce((s, x) => s + x, 0);

  return json({
    availableYears,
    year,
    timezone: "Asia/Manila",
    uniquePatientsInYear: patientDemo.size,
    visitCountInYear: visitRows.length,
    ageDistribution,
    genderDistribution,
    civilStatusDistribution,
    monthly,
    yearTotals: {
      chargesCents: totalsCharges,
      collectedCents: totalsCollected,
      balanceCents: totalsCharges - totalsCollected,
    },
  });
};
