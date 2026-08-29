import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { patientDocumentKind, patientDocuments } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canArchivePatients,
  canMutateClinicalData,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import { documentRowToSummary } from "@/lib/patient-documents";

const patchSchema = z.object({
  caption: z.string().trim().max(300).optional().nullable(),
  kind: z.enum(patientDocumentKind).optional(),
  takenOn: z.string().trim().max(10).optional().nullable(),
});

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canMutateClinicalData(locals.userRole));
  if (denied) return denied;

  const id = params.id?.trim();
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
  const update: Partial<typeof patientDocuments.$inferInsert> = {};
  if (data.caption !== undefined) update.caption = data.caption || null;
  if (data.kind !== undefined) update.kind = data.kind;
  if (data.takenOn !== undefined) update.takenOn = data.takenOn || null;

  if (Object.keys(update).length === 0) {
    return json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await db
    .update(patientDocuments)
    .set(update)
    .where(eq(patientDocuments.id, id))
    .returning();
  if (!updated[0]) return json({ error: "Not found" }, { status: 404 });

  const document = documentRowToSummary(updated[0]);
  await recordAudit(auditActorFromLocals(locals), {
    action: "patient_document.updated",
    entityType: "patient_document",
    entityId: id,
    summary: `Updated details for "${document.fileName}"`,
    details: { fields: Object.keys(update) },
  });

  return json({ document });
};

/** Deleting a clinical record is restricted to Admin I / Admin II. */
export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canArchivePatients(locals.userRole));
  if (denied) return denied;

  const id = params.id?.trim();
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const rows = await db
    .select({
      id: patientDocuments.id,
      patientId: patientDocuments.patientId,
      fileName: patientDocuments.fileName,
      kind: patientDocuments.kind,
    })
    .from(patientDocuments)
    .where(eq(patientDocuments.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return json({ error: "Not found" }, { status: 404 });

  await db.delete(patientDocuments).where(eq(patientDocuments.id, id));

  await recordAudit(auditActorFromLocals(locals), {
    action: "patient_document.deleted",
    entityType: "patient_document",
    entityId: id,
    summary: `Deleted ${row.kind.toLowerCase()} "${row.fileName}" from patient ${row.patientId}`,
    details: { patientId: row.patientId, fileName: row.fileName },
  });

  return json({ ok: true });
};
