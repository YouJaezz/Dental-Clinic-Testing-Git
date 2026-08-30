import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { patients } from "@/db/schema";
import { certificatePurpose, certificateResumeMode } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canMutateClinicalData,
  canReadClinicalData,
  forbidUnless,
} from "@/lib/authz";
import {
  createCertificate,
  listCertificatesForPatient,
} from "@/lib/dental-certificates";
import { json } from "@/lib/http-api";

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

  const certificates = await listCertificatesForPatient(patientId);
  return json({ certificates });
};

const createSchema = z.object({
  patientId: z.string().trim().min(1),
  visitId: z.string().trim().optional().nullable(),
  issuedAt: z.string().trim().min(1),
  purpose: z.enum(certificatePurpose),
  purposeDetail: z.string().trim().max(160).optional().nullable(),
  resumeMode: z.enum(certificateResumeMode),
  resumeDate: z.string().trim().max(10).optional().nullable(),
  resumeDays: z.number().int().min(1).max(365).optional().nullable(),
  remarks: z.string().trim().max(2000).optional().nullable(),
  lineIds: z.array(z.string().trim().min(1)).max(50).default([]),
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
    const certificate = await createCertificate({
      ...parsed.data,
      createdByUserId: locals.userId ?? null,
    });

    await recordAudit(auditActorFromLocals(locals), {
      action: "dental_certificate.created",
      entityType: "dental_certificate",
      entityId: certificate.id,
      summary: `Dental certificate #${certificate.certificateNumber} for patient ${certificate.patientId}`,
      details: {
        purpose: certificate.purpose,
        resumeMode: certificate.resumeMode,
        procedureCount: certificate.lineCount,
      },
    });

    return json({ certificate }, { status: 201 });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not create certificate";
    return json({ error: message }, { status: 400 });
  }
};
