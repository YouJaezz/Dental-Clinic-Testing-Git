import type { APIRoute } from "astro";
import { canManageCorrectionRequests, forbidUnless } from "@/lib/authz";
import { countPendingCorrectionRequests } from "@/lib/correction-requests-query";
import { isMissingSchemaError, MIGRATION_HINT } from "@/lib/db-errors";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ locals }) => {
  const denied = forbidUnless(canManageCorrectionRequests(locals.userRole));
  if (denied) return denied;

  try {
    const pendingCount = await countPendingCorrectionRequests();
    return json({ pendingCount });
  } catch (e) {
    console.error("[correction-requests/pending-count]", e);
    if (isMissingSchemaError(e)) {
      return json({ pendingCount: 0, schemaWarning: MIGRATION_HINT });
    }
    return json({ error: "Could not load pending count" }, { status: 500 });
  }
};
