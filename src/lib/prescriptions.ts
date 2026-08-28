import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  medicineCatalog,
  prescriptionLines,
  prescriptions,
  visits,
} from "@/db/schema";
import {
  guessQuantityUnit,
  type PrescriptionDetail,
  type PrescriptionSummary,
} from "@/lib/medicine-catalog-dto";
import { allocatePrescriptionNumber } from "@/lib/prescription-allocate";
import { parseManilaBirthDateYmdToUtcMs } from "@/lib/patient-age";

function tsToIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }
  return new Date().toISOString();
}

function parsePrescribedAt(input: string): Date | null {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const ms = parseManilaBirthDateYmdToUtcMs(trimmed);
    return ms != null ? new Date(ms) : null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export type CreatePrescriptionInput = {
  patientId: string;
  visitId?: string | null;
  prescribedAt: string;
  notes?: string | null;
  createdByUserId?: string | null;
  lines: {
    catalogId: string;
    doseStrength?: string | null;
    instructions?: string | null;
    quantity: number;
    quantityUnit?: string | null;
  }[];
};

export async function listPrescriptionsForPatient(
  patientId: string,
): Promise<PrescriptionSummary[]> {
  const rows = await db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.patientId, patientId))
    .orderBy(desc(prescriptions.prescribedAt), desc(prescriptions.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const lineCounts = await db
    .select({
      prescriptionId: prescriptionLines.prescriptionId,
    })
    .from(prescriptionLines)
    .where(inArray(prescriptionLines.prescriptionId, ids));

  const countByRx = new Map<string, number>();
  for (const row of lineCounts) {
    countByRx.set(
      row.prescriptionId,
      (countByRx.get(row.prescriptionId) ?? 0) + 1,
    );
  }

  return rows.map((row) => ({
    id: row.id,
    patientId: row.patientId,
    visitId: row.visitId,
    prescriptionNumber: row.prescriptionNumber,
    prescribedAt: tsToIso(row.prescribedAt),
    notes: row.notes,
    lineCount: countByRx.get(row.id) ?? 0,
    createdAt: tsToIso(row.createdAt),
  }));
}

export async function getPrescriptionDetail(
  prescriptionId: string,
): Promise<PrescriptionDetail | null> {
  const rows = await db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, prescriptionId))
    .limit(1);
  const rx = rows[0];
  if (!rx) return null;

  const lines = await db
    .select()
    .from(prescriptionLines)
    .where(eq(prescriptionLines.prescriptionId, prescriptionId))
    .orderBy(prescriptionLines.sortOrder, prescriptionLines.createdAt);

  return {
    id: rx.id,
    patientId: rx.patientId,
    visitId: rx.visitId,
    prescriptionNumber: rx.prescriptionNumber,
    prescribedAt: tsToIso(rx.prescribedAt),
    notes: rx.notes,
    lineCount: lines.length,
    createdAt: tsToIso(rx.createdAt),
    lines: lines.map((line, index) => ({
      id: line.id,
      catalogId: line.catalogId,
      name: line.nameSnapshot,
      doseStrength: line.doseStrength,
      instructions: line.instructions,
      quantity: line.quantity ?? 1,
      quantityUnit: line.quantityUnit ?? null,
      sortOrder: line.sortOrder ?? index,
    })),
  };
}

export async function createPrescription(
  input: CreatePrescriptionInput,
): Promise<PrescriptionDetail> {
  if (input.lines.length === 0) {
    throw new Error("At least one medicine line is required");
  }

  const prescribedAt = parsePrescribedAt(input.prescribedAt);
  if (!prescribedAt) {
    throw new Error("Invalid prescribed date");
  }

  if (input.visitId) {
    const visitRows = await db
      .select({ id: visits.id, patientId: visits.patientId })
      .from(visits)
      .where(eq(visits.id, input.visitId))
      .limit(1);
    const visit = visitRows[0];
    if (!visit) throw new Error("Visit not found");
    if (visit.patientId !== input.patientId) {
      throw new Error("Visit does not belong to this patient");
    }
  }

  const catalogIds = [...new Set(input.lines.map((l) => l.catalogId))];
  const catalogRows = await db
    .select()
    .from(medicineCatalog)
    .where(
      and(
        inArray(medicineCatalog.id, catalogIds),
        eq(medicineCatalog.active, true),
      ),
    );
  const catalogById = new Map(catalogRows.map((row) => [row.id, row]));
  for (const line of input.lines) {
    if (!catalogById.has(line.catalogId)) {
      throw new Error("One or more medicines are invalid or inactive");
    }
  }

  const prescriptionNumber = await allocatePrescriptionNumber();
  const notes = input.notes?.trim() ? input.notes.trim() : null;

  const inserted = await db
    .insert(prescriptions)
    .values({
      patientId: input.patientId,
      visitId: input.visitId ?? null,
      prescriptionNumber,
      prescribedAt,
      notes,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();

  const rx = inserted[0];
  const lineValues = input.lines.map((line, index) => {
    const catalog = catalogById.get(line.catalogId)!;
    const dose = line.doseStrength?.trim() || catalog.defaultDose || null;
    const instructions =
      line.instructions?.trim() || catalog.defaultInstructions || null;
    const quantity =
      Number.isFinite(line.quantity) && line.quantity >= 1
        ? Math.floor(line.quantity)
        : 1;
    return {
      prescriptionId: rx.id,
      catalogId: catalog.id,
      nameSnapshot: catalog.name,
      doseStrength: dose,
      instructions,
      quantity,
      quantityUnit: line.quantityUnit?.trim() || guessQuantityUnit(dose),
      sortOrder: index,
    };
  });

  await db.insert(prescriptionLines).values(lineValues);

  const detail = await getPrescriptionDetail(rx.id);
  if (!detail) throw new Error("Failed to load created prescription");
  return detail;
}
