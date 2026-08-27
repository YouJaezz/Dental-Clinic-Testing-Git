import type { APIRoute } from "astro";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { medicineCatalog, prescriptionLines } from "@/db/schema";
import { medicineCatalogRowToItem } from "@/lib/medicine-catalog-dto";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { canManageCatalog, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

const patchSchema = z.object({
  code: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1).optional(),
  defaultDose: z.string().trim().optional().nullable(),
  defaultInstructions: z.string().trim().optional().nullable(),
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

  const update: Partial<typeof medicineCatalog.$inferInsert> = {};
  if (data.code !== undefined) update.code = data.code;
  if (data.name !== undefined) update.name = data.name;
  if (data.defaultDose !== undefined) update.defaultDose = data.defaultDose;
  if (data.defaultInstructions !== undefined) {
    update.defaultInstructions = data.defaultInstructions;
  }
  if (data.active !== undefined) update.active = data.active;

  const updated = await db
    .update(medicineCatalog)
    .set(update)
    .where(eq(medicineCatalog.id, id))
    .returning();
  if (!updated[0]) return json({ error: "Not found" }, { status: 404 });

  const item = medicineCatalogRowToItem(updated[0]);
  await recordAudit(auditActorFromLocals(locals), {
    action: "medicine_catalog.updated",
    entityType: "medicine_catalog",
    entityId: id,
    summary: `Updated medicine ${item.name}`,
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
    .from(prescriptionLines)
    .where(eq(prescriptionLines.catalogId, id));
  const lineCount = Number(ref[0]?.n ?? 0);
  if (lineCount > 0) {
    return json(
      {
        error:
          "This medicine is referenced on past prescriptions and cannot be deleted. Deactivate it instead.",
      },
      { status: 400 },
    );
  }

  const removed = await db
    .delete(medicineCatalog)
    .where(eq(medicineCatalog.id, id))
    .returning({ id: medicineCatalog.id });
  if (!removed[0]) return json({ error: "Not found" }, { status: 404 });

  await recordAudit(auditActorFromLocals(locals), {
    action: "medicine_catalog.deleted",
    entityType: "medicine_catalog",
    entityId: id,
    summary: `Deleted medicine catalog item ${id}`,
  });
  return json({ ok: true });
};
