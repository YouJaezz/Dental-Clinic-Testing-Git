import type { medicineCatalog } from "@/db/schema";

export type MedicineCatalogItem = {
  id: string;
  code: string | null;
  name: string;
  defaultDose: string | null;
  defaultInstructions: string | null;
  active: boolean;
};

export function medicineCatalogRowToItem(
  row: typeof medicineCatalog.$inferSelect,
): MedicineCatalogItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    defaultDose: row.defaultDose,
    defaultInstructions: row.defaultInstructions,
    active: row.active,
  };
}

export type PrescriptionLineItem = {
  id: string;
  catalogId: string;
  name: string;
  doseStrength: string | null;
  instructions: string | null;
  quantity: number;
  quantityUnit: string | null;
  sortOrder: number;
};

/** Dispense units printed after the `#` count, e.g. `#10caps`. */
export const PRESCRIPTION_QUANTITY_UNITS = [
  "caps",
  "tabs",
  "mL",
  "bottle",
  "sachet",
  "tube",
  "amp",
  "pcs",
] as const;

export const DEFAULT_PRESCRIPTION_QUANTITY_UNIT = "caps";

/** Guess the dispense unit from a dose string like "500 mg capsule". */
export function guessQuantityUnit(doseStrength: string | null): string {
  const dose = doseStrength?.toLowerCase() ?? "";
  if (dose.includes("tablet") || dose.includes("tab")) return "tabs";
  if (dose.includes("capsule") || dose.includes("cap")) return "caps";
  if (dose.includes("syrup") || dose.includes("suspension")) return "bottle";
  if (dose.includes("mouthwash") || dose.includes("solution")) return "mL";
  if (dose.includes("gel") || dose.includes("ointment")) return "tube";
  if (dose.includes("sachet")) return "sachet";
  return DEFAULT_PRESCRIPTION_QUANTITY_UNIT;
}

export type PrescriptionSummary = {
  id: string;
  patientId: string;
  visitId: string | null;
  prescriptionNumber: number;
  prescribedAt: string;
  notes: string | null;
  lineCount: number;
  createdAt: string;
};

export type PrescriptionDetail = PrescriptionSummary & {
  lines: PrescriptionLineItem[];
};
