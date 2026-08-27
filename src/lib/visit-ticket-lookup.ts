import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { patients, visits } from "@/db/schema";
import type { VisitTicketLookupResult } from "@/lib/visit-ticket";

function patientName(first: string, last: string): string {
  return `${last}, ${first}`.trim();
}

function isoDate(v: Date | number): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

export async function lookupVisitByTicketNumber(
  ticketNumber: number,
): Promise<VisitTicketLookupResult | null> {
  const row = await db
    .select({
      visitId: visits.id,
      ticketNumber: visits.ticketNumber,
      visitDate: visits.visitDate,
      status: visits.status,
      patientId: visits.patientId,
      firstName: patients.firstName,
      lastName: patients.lastName,
      contactNumber: patients.contactNumber,
    })
    .from(visits)
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .where(
      and(
        eq(visits.ticketNumber, ticketNumber),
        isNull(patients.deletedAt),
      ),
    )
    .limit(1);

  const v = row[0];
  if (!v?.ticketNumber) return null;

  return {
    visitId: v.visitId,
    ticketNumber: v.ticketNumber,
    visitDate: isoDate(v.visitDate),
    status: v.status as "OPEN" | "CLOSED",
    patientId: v.patientId,
    patientName: patientName(v.firstName, v.lastName),
    contactNumber: v.contactNumber,
  };
}
