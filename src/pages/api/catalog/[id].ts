import type { APIRoute } from "astro";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { procedureCatalog, visitProcedureLines } from "@/db/schema";
import { catalogRowToItem } from "@/lib/catalog-dto";
import {
  catalogHasUnitPrice,
  ensureTierIds,
  parseLevelPricesJson,
  serializeLevelPrices,
} from "@/lib/procedure-pricing";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { canManageCatalog, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

const levelPriceInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1),
  unitPriceCents: z.number().int().nonnegative(),
});

const patchSchema = z.object({
  code: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1).optional(),
  pricingMode: z.enum(["FIXED", "PER_UNIT", "MANUAL", "BY_LEVEL"]).optional(),
  unitPriceCents: z.number().int().nonnegative().optional(),
  levelPrices: z.array(levelPriceInputSchema).optional(),
  dentistNotes: z.string().trim().max(8000).optional().nullable(),
  active: z.boolean().optional(),
});

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canManageCatalog(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const touched = Object.values(data).some((v) => v !== undefined);
  if (!touched) {
    return json({ error: "No fields to update" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(procedureCatalog)
    .where(eq(procedureCatalog.id, id))
    .limit(1);
  if (!existing[0]) return json({ error: "Not found" }, { status: 404 });
  const cur = existing[0];

  const nextPricingMode = data.pricingMode ?? cur.pricingMode;
  let nextUnitPriceCents = cur.unitPriceCents;
  if (data.unitPriceCents !== undefined) {
    nextUnitPriceCents = data.unitPriceCents;
  }
  if (nextPricingMode === "MANUAL" || nextPricingMode === "BY_LEVEL") {
    nextUnitPriceCents = 0;
  }

  let nextLevelPricesJson: string | null = cur.levelPricesJson;
  if (data.levelPrices !== undefined) {
    nextLevelPricesJson = serializeLevelPrices(ensureTierIds(data.levelPrices));
  }
  if (nextPricingMode !== "BY_LEVEL") {
    nextLevelPricesJson = null;
  }

  const pricingTouch =
    data.pricingMode !== undefined ||
    data.unitPriceCents !== undefined ||
    data.levelPrices !== undefined;

  if (pricingTouch && nextPricingMode === "BY_LEVEL") {
    const tiers = parseLevelPricesJson(nextLevelPricesJson) ?? [];
    if (tiers.length === 0) {
      return json(
        {
          error:
            "BY_LEVEL procedures need at least one level; include levelPrices in this update or configure the item first.",
        },
        { status: 400 },
      );
    }
  }

  if (pricingTouch && catalogHasUnitPrice(nextPricingMode)) {
    const wasOpen =
      cur.pricingMode === "MANUAL" || cur.pricingMode === "BY_LEVEL";
    if (wasOpen && data.unitPriceCents === undefined) {
      return json(
        {
          error:
            "unitPriceCents is required when switching this procedure to fixed or per-unit pricing.",
        },
        { status: 400 },
      );
    }
  }

  const update: Partial<typeof procedureCatalog.$inferInsert> = {};
  if (data.code !== undefined) update.code = data.code;
  if (data.name !== undefined) update.name = data.name;
  if (data.active !== undefined) update.active = data.active;
  if (data.dentistNotes !== undefined) update.dentistNotes = data.dentistNotes;
  if (pricingTouch) {
    update.pricingMode = nextPricingMode;
    update.unitPriceCents = nextUnitPriceCents;
    update.levelPricesJson = nextLevelPricesJson;
  }

  if (Object.keys(update).length === 0) {
    return json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await db
    .update(procedureCatalog)
    .set(update)
    .where(eq(procedureCatalog.id, id))
    .returning();
  if (!updated[0]) return json({ error: "Not found" }, { status: 404 });
  const item = catalogRowToItem(updated[0]);
  await recordAudit(auditActorFromLocals(locals), {
    action: "catalog.updated",
    entityType: "catalog",
    entityId: id,
    summary: `Updated catalog item ${item.name}`,
    details: { fields: Object.keys(update) },
  });
  return json({ item });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canManageCatalog(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const ref = await db
    .select({ n: count() })
    .from(visitProcedureLines)
    .where(eq(visitProcedureLines.catalogId, id));
  const lineCount = Number(ref[0]?.n ?? 0);
  if (lineCount > 0) {
    return json(
      {
        error:
          "This procedure is referenced on past visits and cannot be deleted. Deactivate it instead, or remove all visit lines that use it first.",
      },
      { status: 400 },
    );
  }

  const removed = await db
    .delete(procedureCatalog)
    .where(eq(procedureCatalog.id, id))
    .returning({ id: procedureCatalog.id });
  if (!removed[0]) return json({ error: "Not found" }, { status: 404 });
  await recordAudit(auditActorFromLocals(locals), {
    action: "catalog.deleted",
    entityType: "catalog",
    entityId: id,
    summary: `Deleted catalog item ${id}`,
  });
  return json({ ok: true });
};
