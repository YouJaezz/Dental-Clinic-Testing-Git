import { z } from "zod";
import { db } from "@/db/client";
import { patients } from "@/db/schema";
import {
  isMedicalHistoryConditionId,
  serializeMedicalHistoryConditions,
} from "@/lib/medical-history";
import {
  computeAgeFromBirthMs,
  parseManilaBirthDateYmdToUtcMs,
  validateBirthDateMs,
} from "@/lib/patient-age";
import { PATIENT_CIVIL_STATUSES } from "@/lib/patient-civil-status";
import { patientRowToPublic, type PatientPublic } from "@/lib/patient-dto";
import { PATIENT_GENDERS } from "@/lib/patient-gender";
import {
  duplicateCheckSummary,
  findPotentialDuplicatePatients,
} from "@/lib/patient-duplicate-check";

const genderSchema = z.union([z.enum(PATIENT_GENDERS), z.null()]).optional();
const civilStatusSchema = z
  .union([z.enum(PATIENT_CIVIL_STATUSES), z.null()])
  .optional();

export const patientCreateBodySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  contactNumber: z.string().trim().optional().nullable(),
  dateOfBirth: z.string().trim().optional().nullable(),
  gender: genderSchema,
  civilStatus: civilStatusSchema,
  address: z.string().trim().max(500).optional().nullable(),
  medicalHistoryConditions: z.array(z.string()).max(24).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  /** Staff acknowledged this is a different person despite similar records. */
  confirmNotDuplicate: z.boolean().optional(),
});

export type PatientCreateBody = z.infer<typeof patientCreateBodySchema>;

export type CreatePatientResult =
  | { ok: true; patient: PatientPublic }
  | {
      ok: false;
      status: number;
      error: string;
      code?: "POTENTIAL_DUPLICATE";
      duplicates?: Awaited<ReturnType<typeof findPotentialDuplicatePatients>>;
      summary?: string;
    };

export async function createPatientFromBody(
  body: PatientCreateBody,
  options?: {
    intakeSourceNote?: boolean;
    /** Public/self-serve forms cannot override duplicate warnings. */
    allowDuplicateOverride?: boolean;
  },
): Promise<CreatePatientResult> {
  const dobRaw = body.dateOfBirth?.trim() ?? "";
  let dobMs: number | null = null;
  if (dobRaw) {
    dobMs = parseManilaBirthDateYmdToUtcMs(dobRaw);
    if (dobMs == null) {
      return { ok: false, status: 400, error: "Invalid date of birth" };
    }
    const dobErr = validateBirthDateMs(dobMs);
    if (dobErr) {
      return { ok: false, status: 400, error: dobErr };
    }
  }

  const duplicates = await findPotentialDuplicatePatients({
    firstName: body.firstName,
    lastName: body.lastName,
    dateOfBirth: dobRaw || null,
    contactNumber: body.contactNumber ?? null,
  });

  const canOverride =
    options?.allowDuplicateOverride === true && body.confirmNotDuplicate === true;

  if (duplicates.length > 0 && !canOverride) {
    return {
      ok: false,
      status: 409,
      code: "POTENTIAL_DUPLICATE",
      error: duplicateCheckSummary(duplicates),
      duplicates,
      summary: duplicateCheckSummary(duplicates),
    };
  }

  const mhIds = (body.medicalHistoryConditions ?? []).filter(
    isMedicalHistoryConditionId,
  );

  let notes = body.notes?.trim() || null;
  if (canOverride && duplicates.length > 0) {
    const marker = "[Created as new patient — staff confirmed not a duplicate]";
    notes = notes ? `${marker}\n${notes}` : marker;
  }
  if (options?.intakeSourceNote) {
    const marker = "[Self-registered via patient form]";
    notes = notes ? `${marker}\n${notes}` : marker;
  }

  const values = {
    firstName: body.firstName,
    lastName: body.lastName,
    contactNumber: body.contactNumber ?? null,
    dateOfBirth: dobMs != null ? new Date(dobMs) : null,
    age: dobMs != null ? computeAgeFromBirthMs(dobMs) : null,
    gender: body.gender ?? null,
    civilStatus: body.civilStatus ?? null,
    address: body.address ?? null,
    medicalHistory: serializeMedicalHistoryConditions(mhIds),
    notes,
  };

  const inserted = await db.insert(patients).values(values).returning();
  return { ok: true, patient: patientRowToPublic(inserted[0]) };
}
