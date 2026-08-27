/** Stored patient gender — enforced on create/update via API. */
export const PATIENT_GENDERS = ["Male", "Female"] as const;
export type PatientGender = (typeof PATIENT_GENDERS)[number];

/** Maps stored/raw strings to canonical Male/Female, or null if absent or unrecognized (legacy free text). */
export function parseCanonicalPatientGender(
  raw: string | null | undefined,
): PatientGender | null {
  const t = raw?.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (lower === "male") return "Male";
  if (lower === "female") return "Female";
  return null;
}
