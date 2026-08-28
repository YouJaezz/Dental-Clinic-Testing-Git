import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { patients } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canMutateClinicalData,
  canReadClinicalData,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import {
  createPrescription,
  listPrescriptionsForPatient,
} from "@/lib/prescriptions";

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const patientId = url.searchParams.get("patientId")?.trim();
  if (!patientId) {
    return json({ error: "patientId is required" }, { status: 400 });
  }

  const patient = await db
    .select({ id: patients.id })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);
  if (!patient[0]) return json({ error: "Patient not found" }, { status: 404 });

  const prescriptions = await listPrescriptionsForPatient(patientId);
  return json({ prescriptions });
};

const lineSchema = z.object({
  catalogId: z.string().trim().min(1),
  doseStrength: z.string().trim().optional().nullable(),
  instructions: z.string().trim().optional().nullable(),
  quantity: z.number().int().min(1).max(9999),
  quantityUnit: z.string().trim().max(20).optional().nullable(),
});

const createSchema = z.object({
  patientId: z.string().trim().min(1),
  visitId: z.string().trim().optional().nullable(),
  prescribedAt: z.string().trim().min(1),
  notes: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(lineSchema).min(1).max(20),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = forbidUnless(canMutateClinicalData(locals.userRole));
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const prescription = await createPrescription({
      ...parsed.data,
      createdByUserId: locals.userId ?? null,
    });

    await recordAudit(auditActorFromLocals(locals), {
      action: "prescription.created",
      entityType: "prescription",
      entityId: prescription.id,
      summary: `Prescription #${prescription.prescriptionNumber} for patient ${prescription.patientId}`,
    });

    return json({ prescription }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create prescription";
    return json({ error: message }, { status: 400 });
  }
};
