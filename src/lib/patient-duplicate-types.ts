import type { PatientPublic } from "@/lib/patient-dto";

export type DuplicateMatchKind = "same_name_dob" | "same_name_uncertain";

export type PotentialDuplicate = {
  patient: PatientPublic;
  matchKind: DuplicateMatchKind;
  matchReason: string;
};

export function formatDuplicatePatientLine(p: PatientPublic): string {
  const parts = [`${p.lastName}, ${p.firstName}`];
  if (p.dateOfBirth) parts.push(`DOB ${p.dateOfBirth}`);
  if (p.age != null) parts.push(`age ${p.age}`);
  if (p.contactNumber) parts.push(p.contactNumber);
  return parts.join(" · ");
}

export function duplicateCheckSummary(matches: PotentialDuplicate[]): string {
  if (matches.length === 0) return "";
  const strong = matches.some((m) => m.matchKind === "same_name_dob");
  if (strong) {
    return matches.length === 1
      ? "A patient with the same details may already be registered."
      : `${matches.length} existing records may match this person.`;
  }
  return `${matches.length} patient${matches.length === 1 ? "" : "s"} with the same name — please verify date of birth or use the existing record.`;
}
