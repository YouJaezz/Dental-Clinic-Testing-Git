import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { visitStatus, visits } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canDeleteVisits,
  canMutateClinicalData,
  canReadClinicalData,
  canReopenVisits,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import {
  deleteVisitById,
  loadVisitDeletePreview,
} from "@/lib/visit-delete";

const patchSchema = z.object({
  status: z.enum(visitStatus).optional(),
  notes: z.string().trim().optional().nullable(),
  /** Required when closing a visit that has procedure charges (staff safety). */
  confirmClose: z.boolean().optional(),
});

const deleteSchema = z.object({
  confirmDelete: z.literal(true),
});

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canMutateClinicalData(locals.userRole));
  if (denied) return denied;

  const visitId = params.visitId;
  if (!visitId) return json({ error: "Missing visitId" }, { status: 400 });

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

  const existing = await db
    .select({ id: visits.id, status: visits.status })
    .from(visits)
    .where(eq(visits.id, visitId))
    .limit(1);
  if (!existing[0]) return json({ error: "Not found" }, { status: 404 });

  const update: Partial<typeof visits.$inferInsert> = {};
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;

  if (Object.keys(update).length === 0) {
    return json({ error: "No fields to update" }, { status: 400 });
  }

  if (
    parsed.data.status === "OPEN" &&
    existing[0].status === "CLOSED" &&
    !canReopenVisits(locals.userRole)
  ) {
    return json(
      { error: "Only Admin II can reopen a closed visit" },
      { status: 403 },
    );
  }

  if (parsed.data.status === "CLOSED") {
    const preview = await loadVisitDeletePreview(visitId);
    if (
      preview &&
      preview.procedureCount > 0 &&
      parsed.data.confirmClose !== true
    ) {
      return json(
        {
          error:
            "This visit has procedures recorded. Confirm close in the dialog before saving.",
          code: "CONFIRM_CLOSE_REQUIRED",
          procedureCount: preview.procedureCount,
          balanceCents: preview.balanceCents,
        },
        { status: 409 },
      );
    }
  }

  const updated = await db
    .update(visits)
    .set(update)
    .where(eq(visits.id, visitId))
    .returning();
  if (!updated[0]) return json({ error: "Not found" }, { status: 404 });
  const visit = updated[0];
  if (parsed.data.status === "CLOSED") {
    await recordAudit(auditActorFromLocals(locals), {
      action: "visit.closed",
      entityType: "visit",
      entityId: visitId,
      summary: `Closed visit ${visitId}`,
    });
  } else if (
    parsed.data.status === "OPEN" &&
    existing[0].status === "CLOSED"
  ) {
    await recordAudit(auditActorFromLocals(locals), {
      action: "visit.reopened",
      entityType: "visit",
      entityId: visitId,
      summary: `Reopened visit ${visitId}`,
    });
  } else {
    await recordAudit(auditActorFromLocals(locals), {
      action: "visit.updated",
      entityType: "visit",
      entityId: visitId,
      summary: `Updated visit ${visitId}`,
      details: { fields: Object.keys(update) },
    });
  }
  return json({ visit });
};

export const GET: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const visitId = params.visitId;
  if (!visitId) return json({ error: "Missing visitId" }, { status: 400 });

  const preview = await loadVisitDeletePreview(visitId);
  if (!preview) return json({ error: "Not found" }, { status: 404 });

  return json({ preview });
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canDeleteVisits(locals.userRole));
  if (denied) return denied;

  const visitId = params.visitId;
  if (!visitId) return json({ error: "Missing visitId" }, { status: 400 });

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: "confirmDelete: true is required to delete a visit",
      },
      { status: 400 },
    );
  }

  const preview = await loadVisitDeletePreview(visitId);
  if (!preview) return json({ error: "Not found" }, { status: 404 });

  const ok = await deleteVisitById(visitId);
  if (!ok) return json({ error: "Not found" }, { status: 404 });

  await recordAudit(auditActorFromLocals(locals), {
    action: "visit.deleted",
    entityType: "visit",
    entityId: visitId,
    summary: `Deleted ${preview.status} visit (${preview.procedureCount} procedures, ${preview.paymentCount} payments)`,
    details: {
      patientId: preview.patientId,
      chargesCents: preview.chargesCents,
      paidCents: preview.paidCents,
    },
  });

  return json({ ok: true, deletedVisitId: visitId });
};
