import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  correctionRequests,
  patients,
  procedureCatalog,
  users,
  visitProcedureLines,
  visits,
} from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canManageCorrectionRequests,
  canSubmitCorrectionRequests,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import { activeProcedureLine } from "@/lib/procedure-line-filters";

function iso(d: Date | number): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

const postSchema = z.object({
  visitId: z.string().min(1),
  lineId: z.string().min(1),
  reason: z.string().trim().min(8).max(2000),
});

export const GET: APIRoute = async ({ url, locals }) => {
  const isAdmin = canManageCorrectionRequests(locals.userRole);
  const canSubmit = canSubmitCorrectionRequests(locals.userRole);
  if (locals.userRole === "ADMIN_I") {
    /* Admin I uses requests tab */
  } else if (!canSubmit) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const statusParam = url.searchParams.get("status");
  const status =
    statusParam === "PENDING" ||
    statusParam === "APPROVED" ||
    statusParam === "REJECTED"
      ? statusParam
      : undefined;

  const conditions = [eq(correctionRequests.type, "PROCEDURE_VOID")];
  if (status) conditions.push(eq(correctionRequests.status, status));
  if (!isAdmin && locals.userId) {
    conditions.push(eq(correctionRequests.requestedByUserId, locals.userId));
  }

  const rows = await db
    .select({
      id: correctionRequests.id,
      type: correctionRequests.type,
      status: correctionRequests.status,
      visitId: correctionRequests.visitId,
      lineId: correctionRequests.lineId,
      reason: correctionRequests.reason,
      resolutionNote: correctionRequests.resolutionNote,
      createdAt: correctionRequests.createdAt,
      updatedAt: correctionRequests.updatedAt,
      resolvedAt: correctionRequests.resolvedAt,
      requesterEmail: users.email,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      visitDate: visits.visitDate,
      catalogName: procedureCatalog.name,
      lineTotalCents: visitProcedureLines.lineTotalCents,
    })
    .from(correctionRequests)
    .innerJoin(visits, eq(correctionRequests.visitId, visits.id))
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .innerJoin(users, eq(correctionRequests.requestedByUserId, users.id))
    .leftJoin(
      visitProcedureLines,
      and(
        eq(visitProcedureLines.id, correctionRequests.lineId),
        eq(visitProcedureLines.visitId, correctionRequests.visitId),
      ),
    )
    .leftJoin(
      procedureCatalog,
      eq(visitProcedureLines.catalogId, procedureCatalog.id),
    )
    .where(and(...conditions))
    .orderBy(desc(correctionRequests.createdAt))
    .limit(100);

  return json({
    requests: rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      visitId: r.visitId,
      lineId: r.lineId,
      reason: r.reason,
      resolutionNote: r.resolutionNote,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      resolvedAt: r.resolvedAt ? iso(r.resolvedAt) : null,
      requesterEmail: r.requesterEmail,
      patientName: `${r.patientFirstName} ${r.patientLastName}`.trim(),
      visitDate: r.visitDate,
      catalogName: r.catalogName ?? "Unknown procedure",
      lineTotalCents: r.lineTotalCents ?? 0,
    })),
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.userRole === "ADMIN_I" || locals.userRole === "ADMIN_II") {
    return json(
      {
        error:
          "Administrators remove lines directly on the visit (Remove / void). Correction requests are for staff only.",
      },
      { status: 400 },
    );
  }
  const denied = forbidUnless(canSubmitCorrectionRequests(locals.userRole));
  if (denied) return denied;
  if (!locals.userId) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const visitRow = await db
    .select({ status: visits.status })
    .from(visits)
    .where(eq(visits.id, body.visitId))
    .limit(1);
  if (!visitRow[0]) return json({ error: "Visit not found" }, { status: 404 });
  if (visitRow[0].status !== "CLOSED") {
    return json(
      {
        error:
          "Correction requests apply to closed visits only. Remove the line directly while the visit is open.",
      },
      { status: 400 },
    );
  }

  const lineRow = await db
    .select({ id: visitProcedureLines.id })
    .from(visitProcedureLines)
    .where(
      and(
        eq(visitProcedureLines.id, body.lineId),
        eq(visitProcedureLines.visitId, body.visitId),
        activeProcedureLine(),
      ),
    )
    .limit(1);
  if (!lineRow[0]) {
    return json({ error: "Procedure line not found or already voided" }, {
      status: 404,
    });
  }

  const existing = await db
    .select({ id: correctionRequests.id })
    .from(correctionRequests)
    .where(
      and(
        eq(correctionRequests.lineId, body.lineId),
        eq(correctionRequests.status, "PENDING"),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return json(
      { error: "A pending request already exists for this procedure line" },
      { status: 409 },
    );
  }

  const now = new Date();
  const [row] = await db
    .insert(correctionRequests)
    .values({
      type: "PROCEDURE_VOID",
      status: "PENDING",
      visitId: body.visitId,
      lineId: body.lineId,
      requestedByUserId: locals.userId,
      reason: body.reason,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: correctionRequests.id });

  await recordAudit(auditActorFromLocals(locals), {
    action: "correction_request.created",
    entityType: "correction_request",
    entityId: row.id,
    summary: `Requested void of procedure line ${body.lineId} on visit ${body.visitId}`,
    details: { visitId: body.visitId, lineId: body.lineId },
  });

  return json({ ok: true, id: row.id }, { status: 201 });
};
