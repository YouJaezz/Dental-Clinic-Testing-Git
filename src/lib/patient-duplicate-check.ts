import { and, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { patients } from "@/db/schema";
import { patientRowToPublic, type PatientPublic } from "@/lib/patient-dto";
import type {
  DuplicateMatchKind,
  PotentialDuplicate,
} from "@/lib/patient-duplicate-types";

export type {
  DuplicateMatchKind,
  PotentialDuplicate,
} from "@/lib/patient-duplicate-types";
export { duplicateCheckSummary } from "@/lib/patient-duplicate-types";

export function normalizePatientName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Digits only; used for loose contact matching. */
export function normalizePatientContact(value: string): string {
  return value.replace(/\D/g, "");
}

function classifyNameMatch(
  existing: PatientPublic,
  newDobYmd: string | null,
): PotentialDuplicate | null {
  const existingDob = existing.dateOfBirth?.trim() || null;
  const newDob = newDobYmd?.trim() || null;

  if (newDob && existingDob) {
    if (newDob === existingDob) {
      return {
        patient: existing,
        matchKind: "same_name_dob",
        matchReason: "Same first name, last name, and date of birth",
      };
    }
    return null;
  }

  return {
    patient: existing,
    matchKind: "same_name_uncertain",
    matchReason: newDob
      ? "Same name — birthday missing on an existing record (verify before creating)"
      : existingDob
        ? "Same name — please enter date of birth to compare, or verify with staff"
        : "Same name — no birthday on file for either record (verify with patient)",
  };
}

export async function findPotentialDuplicatePatients(input: {
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  contactNumber?: string | null;
  excludePatientId?: string;
}): Promise<PotentialDuplicate[]> {
  const firstNorm = normalizePatientName(input.firstName);
  const lastNorm = normalizePatientName(input.lastName);
  if (!firstNorm || !lastNorm) return [];

  const newDobYmd = input.dateOfBirth?.trim() || null;

  const byId = new Map<string, PotentialDuplicate>();

  const nameRows = await db
    .select()
    .from(patients)
    .where(
      and(
        isNull(patients.deletedAt),
        sql`lower(trim(${patients.firstName})) = ${firstNorm}`,
        sql`lower(trim(${patients.lastName})) = ${lastNorm}`,
      ),
    )
    .limit(25);

  for (const row of nameRows) {
    if (input.excludePatientId && row.id === input.excludePatientId) continue;
    const pub = patientRowToPublic(row);
    const match = classifyNameMatch(pub, newDobYmd);
    if (match) byId.set(pub.id, match);
  }

  const list = [...byId.values()];
  list.sort((a, b) => {
    const rank: Record<DuplicateMatchKind, number> = {
      same_name_dob: 0,
      same_name_uncertain: 1,
    };
    return rank[a.matchKind] - rank[b.matchKind];
  });
  return list;
}
