import type { APIRoute } from "astro";
import { isAdminI, isAdminII } from "@/lib/authz";
import {
  getAdminGateConfig,
  hasValidAdminGateGrant,
} from "@/lib/admin-gate";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ request, locals }) => {
  if (!isAdminI(locals.userRole) && !isAdminII(locals.userRole)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await getAdminGateConfig();
  const unlocked =
    isAdminII(locals.userRole) ||
    (isAdminI(locals.userRole) &&
      (await hasValidAdminGateGrant(request, locals.userId)));

  return json({
    configured: config.configured,
    unlocked,
    requiresGate: isAdminI(locals.userRole),
  });
};
