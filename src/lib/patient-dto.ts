import type { patients } from "@/db/schema";
import {
  birthMsToManilaYmd,
  computeAgeFromBirthMs,
} from "@/lib/patient-age";

export type PatientApiRow = typeof patients.$inferSelect;

/** Shape returned from patient APIs (no legacy phone field). */
export type PatientPublic = {
  id: string;
  firstName: string;
  lastName: string;
  contactNumber: string | null;
  /** Manila calendar date yyyy-MM-dd */
  dateOfBirth: string | null;
  /** Derived from date of birth when set; legacy rows may have age without DOB until edited */
  age: number | null;
  gender: string | null;
  civilStatus: string | null;
  address: string | null;
  medicalHistory: string | null;
  notes: string | null;
  /** ISO timestamp when the record was created */
  createdAt: string;
};

function createdAtToIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function birthColumnToMs(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function patientRowToPublic(row: PatientApiRow): PatientPublic {
  const dobMs = birthColumnToMs(row.dateOfBirth);
  let age = row.age;
  let dateOfBirth: string | null = null;
  if (dobMs != null) {
    dateOfBirth = birthMsToManilaYmd(dobMs);
    age = computeAgeFromBirthMs(dobMs);
  }
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    contactNumber: row.contactNumber,
    dateOfBirth,
    age,
    gender: row.gender,
    civilStatus: row.civilStatus,
    address: row.address,
    medicalHistory: row.medicalHistory,
    notes: row.notes,
    createdAt: createdAtToIso(row.createdAt),
  };
}
