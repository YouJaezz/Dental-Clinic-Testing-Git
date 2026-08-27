import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { loadVisitPaymentReceipt } from "@/lib/visit-payment-receipt";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const visitId = params.visitId;
  if (!visitId) return json({ error: "Missing visitId" }, { status: 400 });

  const data = await loadVisitPaymentReceipt(visitId);
  if (!data) return json({ error: "Not found" }, { status: 404 });

  return json(data.summary);
};
