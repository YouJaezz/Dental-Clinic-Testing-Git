import type { APIRoute } from "astro";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";
import { loadPatientHistory } from "@/lib/patient-history";

export const GET: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const patientId = params.patientId;
  if (!patientId) return json({ error: "Missing patientId" }, { status: 400 });

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const visitLimit =
    limitRaw != null && /^\d+$/.test(limitRaw)
      ? Math.min(Math.max(1, parseInt(limitRaw, 10)), 100)
      : undefined;

  const data = await loadPatientHistory(patientId, { visitLimit });
  if (!data) return json({ error: "Not found" }, { status: 404 });
  return json(data);
};
