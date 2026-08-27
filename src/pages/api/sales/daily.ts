import type { APIRoute } from "astro";
import {
  buildDailySalesReport,
  resolveDailySalesDate,
} from "@/lib/daily-sales";
import {
  canPickDailySalesDate,
  canViewDailySales,
  forbidUnless,
} from "@/lib/authz";
import { isMissingSchemaError, MIGRATION_HINT } from "@/lib/db-errors";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = forbidUnless(canViewDailySales(locals.userRole));
  if (denied) return denied;

  const canPick = canPickDailySalesDate(locals.userRole);
  const dateParam = url.searchParams.get("date");
  const resolved = resolveDailySalesDate(dateParam, canPick);
  if ("error" in resolved) {
    return json({ error: resolved.error }, { status: 400 });
  }

  try {
    const report = await buildDailySalesReport(resolved.date, canPick);
    if ("error" in report) {
      return json({ error: report.error }, { status: 400 });
    }
    return json({ report });
  } catch (e) {
    console.error("[sales/daily]", e);
    const message = isMissingSchemaError(e) ? MIGRATION_HINT : "Daily sales failed to load.";
    return json({ error: message }, { status: 500 });
  }
};
