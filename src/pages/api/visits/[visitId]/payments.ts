import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { paymentStatus, visitPayments, visits } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { canMutateClinicalData, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

const postSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.string().trim().min(1),
  status: z.enum(paymentStatus).optional(),
  reference: z.string().trim().optional().nullable(),
});

export const POST: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canMutateClinicalData(locals.userRole));
  if (denied) return denied;

  const visitId = params.visitId;
  if (!visitId) return json({ error: "Missing visitId" }, { status: 400 });

  const visitRow = await db
    .select()
    .from(visits)
    .where(eq(visits.id, visitId))
    .limit(1);
  if (!visitRow[0]) return json({ error: "Not found" }, { status: 404 });
  if (visitRow[0].status === "CLOSED") {
    return json({ error: "Visit is closed" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const inserted = await db
    .insert(visitPayments)
    .values({
      visitId,
      amountCents: parsed.data.amountCents,
      method: parsed.data.method,
      status: parsed.data.status ?? "COMPLETED",
      reference: parsed.data.reference ?? null,
      recordedByUserId: locals.userId,
    })
    .returning();

  const payment = inserted[0]!;
  await recordAudit(auditActorFromLocals(locals), {
    action: "payment.recorded",
    entityType: "visit",
    entityId: visitId,
    summary: `Recorded payment on visit ${visitId}`,
    details: {
      amountCents: payment.amountCents,
      method: payment.method,
    },
  });
  return json({ payment }, { status: 201 });
};
