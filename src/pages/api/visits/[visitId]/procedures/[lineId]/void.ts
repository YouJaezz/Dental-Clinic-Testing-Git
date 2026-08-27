import type { APIRoute } from "astro";
import { z } from "zod";
import { procedureVoidCategory } from "@/db/schema";
import { auditActorFromLocals } from "@/lib/audit-log";
import { canVoidClosedProcedureLines, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";
import { voidProcedureLine } from "@/lib/procedure-void";

const bodySchema = z.object({
  category: z.enum(procedureVoidCategory),
  reason: z.string().trim().max(2000).optional(),
});

export const POST: APIRoute = async ({ params, locals, request }) => {
  const denied = forbidUnless(canVoidClosedProcedureLines(locals.userRole));
  if (denied) return denied;

  const visitId = params.visitId;
  const lineId = params.lineId;
  if (!visitId || !lineId) {
    return json({ error: "Missing visitId or lineId" }, { status: 400 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await voidProcedureLine({
    visitId,
    lineId,
    category: body.category,
    reason: body.reason,
    actor: auditActorFromLocals(locals),
    requireClosedVisit: true,
  });

  if ("error" in result) {
    return json({ error: result.error }, { status: result.status });
  }

  return json({
    ok: true,
    lineId: result.lineId,
    catalogName: result.catalogName,
    category: result.category,
  });
};
