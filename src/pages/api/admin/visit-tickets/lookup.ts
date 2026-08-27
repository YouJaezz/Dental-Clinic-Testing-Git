import type { APIRoute } from "astro";
import { canUseAdvancedAdmin, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";
import { lookupVisitByTicketNumber } from "@/lib/visit-ticket-lookup";
import { parseVisitTicketQuery } from "@/lib/visit-ticket";
import { workspaceQuery } from "@/lib/workspace-url";

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = forbidUnless(canUseAdvancedAdmin(locals.userRole));
  if (denied) return denied;

  const ticket = parseVisitTicketQuery(url.searchParams.get("ticket") ?? "");
  if (ticket == null) {
    return json({ error: "Enter a valid ticket number (e.g. 1042 or #1042)" }, { status: 400 });
  }

  const match = await lookupVisitByTicketNumber(ticket);
  if (!match) {
    return json({ error: "No visit found with that ticket number" }, { status: 404 });
  }

  return json({
    visit: match,
    workspaceHref: `/workspace${workspaceQuery(match.patientId, match.visitId)}`,
  });
};
