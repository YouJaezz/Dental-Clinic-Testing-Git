import type { APIRoute } from "astro";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { medicineCatalog } from "@/db/schema";
import { medicineCatalogRowToItem } from "@/lib/medicine-catalog-dto";
import {
  canManageCatalog,
  canReadClinicalData,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const all = url.searchParams.get("all") === "1";
  const adminDenied = forbidUnless(!all || canManageCatalog(locals.userRole));
  if (adminDenied) return adminDenied;

  const rows = all
    ? await db
        .select()
        .from(medicineCatalog)
        .orderBy(asc(medicineCatalog.name))
    : await db
        .select()
        .from(medicineCatalog)
        .where(eq(medicineCatalog.active, true))
        .orderBy(asc(medicineCatalog.name));

  return json({ catalog: rows.map(medicineCatalogRowToItem) });
};

const createSchema = z.object({
  code: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1),
  defaultDose: z.string().trim().optional().nullable(),
  defaultInstructions: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = forbidUnless(canManageCatalog(locals.userRole));
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const inserted = await db
    .insert(medicineCatalog)
    .values({
      code: d.code ?? null,
      name: d.name,
      defaultDose: d.defaultDose ?? null,
      defaultInstructions: d.defaultInstructions ?? null,
      active: d.active ?? true,
    })
    .returning();

  return json(
    { item: medicineCatalogRowToItem(inserted[0]) },
    { status: 201 },
  );
};
