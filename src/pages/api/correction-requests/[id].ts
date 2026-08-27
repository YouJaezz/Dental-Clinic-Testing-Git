import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { correctionRequests } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { canManageCorrectionRequests, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";
import { voidProcedureLine } from "@/lib/procedure-void";

const patchSchema = z.object({
  action: z.enum(["approve", "reject"]),
  resolutionNote: z.string().trim().max(2000).optional(),
});

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canManageCorrectionRequests(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const row = await db
    .select()
    .from(correctionRequests)
    .where(eq(correctionRequests.id, id))
    .limit(1);
  if (!row[0]) return json({ error: "Not found" }, { status: 404 });
  if (row[0].status !== "PENDING") {
    return json({ error: "Request is no longer pending" }, { status: 400 });
  }

  const now = new Date();
  const actor = auditActorFromLocals(locals);
  const note = body.resolutionNote?.trim() || null;

  if (body.action === "reject") {
    await db
      .update(correctionRequests)
      .set({
        status: "REJECTED",
        resolvedByUserId: locals.userId ?? null,
        resolvedAt: now,
        resolutionNote: note,
        updatedAt: now,
      })
      .where(eq(correctionRequests.id, id));

    await recordAudit(actor, {
      action: "correction_request.rejected",
      entityType: "correction_request",
      entityId: id,
      summary: `Rejected correction request ${id}`,
    });

    return json({ ok: true, status: "REJECTED" });
  }

  const voidResult = await voidProcedureLine({
    visitId: row[0].visitId,
    lineId: row[0].lineId,
    category: "ERROR",
    reason: `Approved staff request: ${row[0].reason}`,
    actor,
    requireClosedVisit: true,
  });

  if (!voidResult.ok) {
    return json({ error: voidResult.error }, { status: voidResult.status });
  }

  await db
    .update(correctionRequests)
    .set({
      status: "APPROVED",
      resolvedByUserId: locals.userId ?? null,
      resolvedAt: now,
      resolutionNote: note,
      updatedAt: now,
    })
    .where(eq(correctionRequests.id, id));

  await recordAudit(actor, {
    action: "correction_request.approved",
    entityType: "correction_request",
    entityId: id,
    summary: `Approved and voided procedure line ${row[0].lineId}`,
    details: { visitId: row[0].visitId, lineId: row[0].lineId },
  });

  return json({ ok: true, status: "APPROVED" });
};
