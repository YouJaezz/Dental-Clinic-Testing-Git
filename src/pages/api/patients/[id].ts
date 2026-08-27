import type { APIRoute } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { patients } from "@/db/schema";
import {
  isMedicalHistoryConditionId,
  serializeMedicalHistoryConditions,
} from "@/lib/medical-history";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canArchivePatients,
  canMutateClinicalData,
  canReadClinicalData,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import {
  computeAgeFromBirthMs,
  parseManilaBirthDateYmdToUtcMs,
  validateBirthDateMs,
} from "@/lib/patient-age";
import { patientRowToPublic } from "@/lib/patient-dto";
import { PATIENT_CIVIL_STATUSES } from "@/lib/patient-civil-status";
import { PATIENT_GENDERS } from "@/lib/patient-gender";

const genderSchema = z
  .union([z.enum(PATIENT_GENDERS), z.null()])
  .optional();

const civilStatusSchema = z
  .union([z.enum(PATIENT_CIVIL_STATUSES), z.null()])
  .optional();

const patchSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  contactNumber: z.string().trim().optional().nullable(),
  /** yyyy-MM-dd, or null to clear */
  dateOfBirth: z.union([z.string(), z.null()]).optional(),
  gender: genderSchema,
  civilStatus: civilStatusSchema,
  address: z.string().trim().max(500).optional().nullable(),
  medicalHistoryConditions: z.array(z.string()).max(24).optional(),
  notes: z.string().trim().optional().nullable(),
});

export const GET: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const row = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, id), isNull(patients.deletedAt)))
    .limit(1);
  if (!row[0]) return json({ error: "Not found" }, { status: 404 });
  return json({ patient: patientRowToPublic(row[0]) });
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canMutateClinicalData(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const update: Partial<typeof patients.$inferInsert> = {};
  if (data.firstName !== undefined) update.firstName = data.firstName;
  if (data.lastName !== undefined) update.lastName = data.lastName;
  if (data.contactNumber !== undefined) update.contactNumber = data.contactNumber;
  if (data.dateOfBirth !== undefined) {
    if (data.dateOfBirth === null) {
      update.dateOfBirth = null;
      update.age = null;
    } else {
      const trimmed = data.dateOfBirth.trim();
      if (!trimmed) {
        update.dateOfBirth = null;
        update.age = null;
      } else {
        const dobMs = parseManilaBirthDateYmdToUtcMs(trimmed);
        if (dobMs == null) {
          return json({ error: "Invalid date of birth" }, { status: 400 });
        }
        const dobErr = validateBirthDateMs(dobMs);
        if (dobErr) {
          return json({ error: dobErr }, { status: 400 });
        }
        update.dateOfBirth = new Date(dobMs);
        update.age = computeAgeFromBirthMs(dobMs);
      }
    }
  }
  if (data.gender !== undefined) update.gender = data.gender;
  if (data.civilStatus !== undefined) update.civilStatus = data.civilStatus;
  if (data.address !== undefined) update.address = data.address;
  if (data.medicalHistoryConditions !== undefined) {
    const mhIds = data.medicalHistoryConditions.filter(
      isMedicalHistoryConditionId,
    );
    update.medicalHistory = serializeMedicalHistoryConditions(mhIds);
  }
  if (data.notes !== undefined) update.notes = data.notes;

  if (Object.keys(update).length === 0) {
    return json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await db
    .update(patients)
    .set(update)
    .where(and(eq(patients.id, id), isNull(patients.deletedAt)))
    .returning();
  if (!updated[0]) return json({ error: "Not found" }, { status: 404 });
  const p = patientRowToPublic(updated[0]);
  await recordAudit(auditActorFromLocals(locals), {
    action: "patient.updated",
    entityType: "patient",
    entityId: id,
    summary: `Updated patient ${p.firstName} ${p.lastName}`,
    details: { fields: Object.keys(update) },
  });
  return json({ patient: p });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canArchivePatients(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const active = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, id), isNull(patients.deletedAt)))
    .limit(1);
  if (!active[0]) {
    return json({ error: "Not found" }, { status: 404 });
  }

  await db
    .update(patients)
    .set({ deletedAt: new Date() })
    .where(eq(patients.id, id));

  await recordAudit(auditActorFromLocals(locals), {
    action: "patient.archived",
    entityType: "patient",
    entityId: id,
    summary: `Archived patient ${id}`,
  });

  return json({ ok: true });
};
