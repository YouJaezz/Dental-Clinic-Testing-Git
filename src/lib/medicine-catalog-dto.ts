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
  sortOrder: number;
};

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
