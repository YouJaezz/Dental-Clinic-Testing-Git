import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { appLocale, users } from "@/db/schema";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";
import {
  localeCookieHeader,
  parseLocale,
  readLocaleFromCookieHeader,
} from "@/lib/locale-cookie";

const patchSchema = z.object({
  locale: z.enum(appLocale),
});

export const GET: APIRoute = async ({ request, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const fromCookie = readLocaleFromCookieHeader(request.headers.get("cookie"));
  const row = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, locals.userId!))
    .limit(1);
  const locale = parseLocale(row[0]?.locale ?? fromCookie ?? "en");
  return json({ locale });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid locale" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ locale: parsed.data.locale })
    .where(eq(users.id, locals.userId!));

  const maxAge = 60 * 60 * 24 * 365;
  return new Response(JSON.stringify({ locale: parsed.data.locale }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": localeCookieHeader(parsed.data.locale, maxAge),
    },
  });
};
