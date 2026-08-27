import type { APIRoute } from "astro";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";
import { loadPatientRegistryStats } from "@/lib/patient-registry-stats";

export const GET: APIRoute = async ({ locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const stats = await loadPatientRegistryStats();
  return json(stats);
};
