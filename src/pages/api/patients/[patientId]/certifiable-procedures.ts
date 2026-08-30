import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { patients } from "@/db/schema";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { listCertifiableProcedures } from "@/lib/dental-certificates";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const patientId = params.patientId?.trim();
  if (!patientId) return json({ error: "Missing patientId" }, { status: 400 });

  const patient = await db
    .select({ id: patients.id })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);
  if (!patient[0]) return json({ error: "Patient not found" }, { status: 404 });

  const procedures = await listCertifiableProcedures(patientId);
  return json({ procedures });
};
