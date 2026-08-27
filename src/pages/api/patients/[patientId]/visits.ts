import type { APIRoute } from "astro";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { patients, visits } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canCloseOpenVisitToStartNew,
  canMutateClinicalData,
  canReadClinicalData,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import { allocateVisitTicketNumber } from "@/lib/visit-ticket-allocate";

export const GET: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const patientId = params.patientId;
  if (!patientId) return json({ error: "Missing patientId" }, { status: 400 });

  const rows = await db
    .select()
    .from(visits)
    .where(eq(visits.patientId, patientId))
    .orderBy(desc(visits.visitDate));

  return json({ visits: rows });
};

const createSchema = z.object({
  visitDate: z.coerce.date().optional(),
  notes: z.string().trim().optional().nullable(),
  /** Close all open visits for this patient, then start a new one. */
  closeExistingOpenVisits: z.boolean().optional(),
});

export const POST: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canMutateClinicalData(locals.userRole));
  if (denied) return denied;

  const patientId = params.patientId;
  if (!patientId) return json({ error: "Missing patientId" }, { status: 400 });

  const p = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
    .limit(1);
  if (!p[0]) return json({ error: "Patient not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const openRows = await db
    .select({
      id: visits.id,
      visitDate: visits.visitDate,
      status: visits.status,
    })
    .from(visits)
    .where(and(eq(visits.patientId, patientId), eq(visits.status, "OPEN")))
    .orderBy(desc(visits.visitDate));

  if (
    openRows.length > 0 &&
    parsed.data.closeExistingOpenVisits === true &&
    !canCloseOpenVisitToStartNew(locals.userRole)
  ) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  if (openRows.length > 0 && parsed.data.closeExistingOpenVisits !== true) {
    return json(
      {
        error:
          "This patient already has an open visit. Close it first, or close it and start a new visit.",
        code: "OPEN_VISIT_EXISTS",
        openVisits: openRows.map((v) => ({
          id: v.id,
          visitDate:
            v.visitDate instanceof Date
              ? v.visitDate.toISOString()
              : new Date(v.visitDate).toISOString(),
          status: v.status,
        })),
      },
      { status: 409 },
    );
  }

  if (openRows.length > 0 && parsed.data.closeExistingOpenVisits === true) {
    for (const open of openRows) {
      await db
        .update(visits)
        .set({ status: "CLOSED" })
        .where(eq(visits.id, open.id));
      await recordAudit(auditActorFromLocals(locals), {
        action: "visit.closed",
        entityType: "visit",
        entityId: open.id,
        summary: `Closed open visit before starting a new visit`,
        details: { patientId, replacedByNewVisit: true },
      });
    }
  }

  const visitDate = parsed.data.visitDate ?? new Date();
  const ticketNumber = await allocateVisitTicketNumber();
  const inserted = await db
    .insert(visits)
    .values({
      patientId,
      visitDate,
      status: "OPEN",
      ticketNumber,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  const visit = inserted[0]!;
  await recordAudit(auditActorFromLocals(locals), {
    action: "visit.started",
    entityType: "visit",
    entityId: visit.id,
    summary: `Opened visit for patient ${patientId}`,
    details: { patientId, ticketNumber: visit.ticketNumber },
  });
  return json({ visit }, { status: 201 });
};
