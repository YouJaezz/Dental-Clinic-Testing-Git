import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";
import { parseLocale } from "@/lib/locale-cookie";

export const GET: APIRoute = async ({ locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const row = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, locals.userId!))
    .limit(1);

  return json({
    user: {
      id: locals.userId,
      email: locals.userEmail,
      role: locals.userRole,
      locale: parseLocale(row[0]?.locale ?? locals.userLocale),
    },
  });
};
