import type { APIRoute } from "astro";
import { json } from "@/lib/http-api";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { getPrescriptionDetail } from "@/lib/prescriptions";

export const GET: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const prescription = await getPrescriptionDetail(id);
  if (!prescription) return json({ error: "Not found" }, { status: 404 });

  return json({ prescription });
};
