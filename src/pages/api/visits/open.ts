import type { APIRoute } from "astro";
import { buildOngoingVisitsReport } from "@/lib/ongoing-visits";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const sort = url.searchParams.get("sort");
  const catalogId = url.searchParams.get("catalogId");
  const report = await buildOngoingVisitsReport(sort, catalogId);
  return json({ report });
};
