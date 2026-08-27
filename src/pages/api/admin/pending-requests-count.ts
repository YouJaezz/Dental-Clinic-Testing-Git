import type { APIRoute } from "astro";
import { isAdminI, forbidUnless } from "@/lib/authz";
import { countPendingCorrectionRequests } from "@/lib/correction-requests-query";
import { countPendingRoleElevationRequests } from "@/lib/role-elevation-query";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ locals }) => {
  const denied = forbidUnless(isAdminI(locals.userRole));
  if (denied) return denied;

  const [correctionCount, elevationCount] = await Promise.all([
    countPendingCorrectionRequests(),
    countPendingRoleElevationRequests(),
  ]);

  return json({
    pendingCount: correctionCount + elevationCount,
    correctionCount,
    elevationCount,
  });
};
