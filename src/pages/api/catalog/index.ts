import type { APIRoute } from "astro";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { procedureCatalog } from "@/db/schema";
import { catalogRowToItem } from "@/lib/catalog-dto";
import {
  catalogHasUnitPrice,
  ensureTierIds,
  serializeLevelPrices,
} from "@/lib/procedure-pricing";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
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
  const adminDenied = forbidUnless(
    !all || canManageCatalog(locals.userRole),
  );
  if (adminDenied) return adminDenied;

  const rows = all
    ? await db.select().from(procedureCatalog).orderBy(asc(procedureCatalog.name))
    : await db
        .select()
        .from(procedureCatalog)
        .where(eq(procedureCatalog.active, true))
        .orderBy(asc(procedureCatalog.name));
  return json({ catalog: rows.map(catalogRowToItem) });
};

const levelPriceInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1),
  unitPriceCents: z.number().int().nonnegative(),
});

const createSchema = z
  .object({
    code: z.string().trim().optional().nullable(),
    name: z.string().trim().min(1),
    pricingMode: z
      .enum(["FIXED", "PER_UNIT", "MANUAL", "BY_LEVEL"])
      .optional()
      .default("FIXED"),
    unitPriceCents: z.number().int().nonnegative().optional(),
    levelPrices: z.array(levelPriceInputSchema).optional(),
    dentistNotes: z.string().trim().max(8000).optional().nullable(),
    active: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const mode = data.pricingMode ?? "FIXED";
    if (catalogHasUnitPrice(mode)) {
      if (data.unitPriceCents === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unitPriceCents is required when pricingMode is ${mode}`,
          path: ["unitPriceCents"],
        });
      }
    } else if (mode === "BY_LEVEL") {
      const lp = data.levelPrices ?? [];
      if (lp.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "levelPrices must include at least one level when pricingMode is BY_LEVEL",
          path: ["levelPrices"],
        });
      }
    }
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
  const pricingMode = d.pricingMode ?? "FIXED";
  const unitPriceCents = catalogHasUnitPrice(pricingMode)
    ? (d.unitPriceCents as number)
    : 0;
  const levelPricesJson =
    pricingMode === "BY_LEVEL"
      ? serializeLevelPrices(ensureTierIds(d.levelPrices ?? []))
      : null;

  const inserted = await db
    .insert(procedureCatalog)
    .values({
      code: d.code ?? null,
      name: d.name,
      unitPriceCents,
      pricingMode,
      levelPricesJson,
      dentistNotes: d.dentistNotes ?? null,
      active: d.active ?? true,
    })
    .returning();

  const item = catalogRowToItem(inserted[0]);
  await recordAudit(auditActorFromLocals(locals), {
    action: "catalog.created",
    entityType: "catalog",
    entityId: item.id,
    summary: `Added catalog item ${item.name}`,
  });
  return json({ item }, { status: 201 });
};
