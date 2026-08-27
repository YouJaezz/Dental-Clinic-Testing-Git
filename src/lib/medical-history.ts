/** Stable ids stored as JSON array in `patients.medical_history`. */
export const MEDICAL_HISTORY_OPTIONS = [
  { id: "hypertension", label: "Hypertension (high blood pressure)" },
  { id: "diabetes", label: "Diabetes" },
  { id: "heart_disease", label: "Heart disease" },
  { id: "bleeding_disorder", label: "Bleeding disorder / on blood thinners" },
  { id: "asthma_respiratory", label: "Asthma or other lung disease" },
  { id: "kidney_disease", label: "Kidney disease" },
  { id: "liver_disease", label: "Liver disease" },
  { id: "cancer_history", label: "Cancer (current or past treatment)" },
  { id: "immunocompromise", label: "Weakened immune system / HIV" },
  { id: "pregnancy", label: "Pregnancy" },
  { id: "seizure_disorder", label: "Seizure disorder / epilepsy" },
  {
    id: "osteoporosis_bisphosphonate",
    label: "Osteoporosis / bisphosphonate use",
  },
  { id: "hepatitis", label: "Hepatitis" },
  { id: "stroke_tia", label: "Stroke or TIA history" },
  { id: "drug_allergies", label: "Allergies to medications" },
  { id: "latex_allergy", label: "Latex allergy" },
] as const;

export type MedicalHistoryConditionId =
  (typeof MEDICAL_HISTORY_OPTIONS)[number]["id"];

const ALLOWED_IDS = new Set<string>(
  MEDICAL_HISTORY_OPTIONS.map((o) => o.id),
);

const labelById = Object.fromEntries(
  MEDICAL_HISTORY_OPTIONS.map((o) => [o.id, o.label]),
) as Record<string, string>;

export function isMedicalHistoryConditionId(
  id: string,
): id is MedicalHistoryConditionId {
  return ALLOWED_IDS.has(id);
}

/** Parse DB value: JSON array of ids, or legacy free-text (not JSON). */
export function parseMedicalHistoryStored(raw: string | null): {
  conditionIds: MedicalHistoryConditionId[];
  legacyFreeText: string | null;
} {
  if (raw == null || raw.trim() === "") {
    return { conditionIds: [], legacyFreeText: null };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return { conditionIds: [], legacyFreeText: raw };
    }
    const ids: MedicalHistoryConditionId[] = [];
    for (const x of parsed) {
      if (typeof x === "string" && isMedicalHistoryConditionId(x)) {
        ids.push(x);
      }
    }
    const unique = [...new Set(ids)].sort();
    return { conditionIds: unique, legacyFreeText: null };
  } catch {
    return { conditionIds: [], legacyFreeText: raw };
  }
}

export function serializeMedicalHistoryConditions(
  ids: string[],
): string | null {
  const unique = [...new Set(ids)]
    .filter(isMedicalHistoryConditionId)
    .sort();
  if (unique.length === 0) return null;
  return JSON.stringify(unique);
}

/** Short list for tables (comma-separated labels). */
export function formatMedicalHistorySummary(raw: string | null): string {
  const { conditionIds, legacyFreeText } = parseMedicalHistoryStored(raw);
  if (conditionIds.length > 0) {
    return conditionIds.map((id) => labelById[id] ?? id).join(", ");
  }
  if (legacyFreeText?.trim()) {
    return legacyFreeText.trim();
  }
  return "—";
}
