import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  medicineCatalog,
  patients,
  prescriptionLines,
  prescriptions,
} from "@/db/schema";
import type { PrescriptionDetail } from "@/lib/medicine-catalog-dto";
import { patientRowToPublic } from "@/lib/patient-dto";
import {
  computeAgeFromBirthMs,
  parseManilaBirthDateYmdToUtcMs,
} from "@/lib/patient-age";
import { parseCanonicalPatientGender } from "@/lib/patient-gender";

function tsToIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }
  return new Date().toISOString();
}

export async function loadPrescriptionPrint(prescriptionId: string) {
  const rxRows = await db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, prescriptionId))
    .limit(1);
  const rx = rxRows[0];
  if (!rx) return null;

  const patientRows = await db
    .select()
    .from(patients)
    .where(eq(patients.id, rx.patientId))
    .limit(1);
  const patientRow = patientRows[0];
  if (!patientRow) return null;

  const lines = await db
    .select()
    .from(prescriptionLines)
    .where(eq(prescriptionLines.prescriptionId, prescriptionId))
    .orderBy(asc(prescriptionLines.sortOrder), asc(prescriptionLines.createdAt));

  const patient = patientRowToPublic(patientRow);
  const dobMs = patient.dateOfBirth
    ? parseManilaBirthDateYmdToUtcMs(patient.dateOfBirth)
    : null;
  const age =
    dobMs != null
      ? computeAgeFromBirthMs(dobMs)
      : patient.age;

  const detail: PrescriptionDetail = {
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
      sortOrder: line.sortOrder ?? index,
    })),
  };

  return {
    prescription: detail,
    patient: {
      ...patient,
      displayAge: age,
      displayGender: parseCanonicalPatientGender(patient.gender) ?? patient.gender,
    },
  };
}

export async function loadMedicineCatalogActive() {
  const rows = await db
    .select()
    .from(medicineCatalog)
    .where(eq(medicineCatalog.active, true))
    .orderBy(asc(medicineCatalog.name));
  return rows;
}
