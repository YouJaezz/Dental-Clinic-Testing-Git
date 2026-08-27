/** Stored patient civil status — enforced on create/update via API. */
export const PATIENT_CIVIL_STATUSES = [
  "Single",
  "Married",
  "Widowed",
  "Separated",
  "Divorced",
  "Annulled",
  "Live-in",
] as const;

export type PatientCivilStatus = (typeof PATIENT_CIVIL_STATUSES)[number];

const CANONICAL_BY_LOWER = new Map(
  PATIENT_CIVIL_STATUSES.map((s) => [s.toLowerCase(), s]),
);

/** Maps stored/raw strings to a canonical value, or null if absent or unrecognized. */
export function parseCanonicalPatientCivilStatus(
  raw: string | null | undefined,
): PatientCivilStatus | null {
  const t = raw?.trim();
  if (!t) return null;
  return CANONICAL_BY_LOWER.get(t.toLowerCase()) ?? null;
}
