import type { APIRoute } from "astro";
import { z } from "zod";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  listAdminICandidates,
  needsAdminIISetup,
  promoteAdminIToAdminII,
} from "@/lib/admin-ii-bootstrap";
import { isAdminI, isAdminLike } from "@/lib/authz";
import { json } from "@/lib/http-api";

const postSchema = z.object({
  targetUserId: z.string().uuid(),
});

export const GET: APIRoute = async ({ locals }) => {
  if (!isAdminLike(locals.userRole)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const needsSetup = await needsAdminIISetup();
  const candidates = needsSetup ? await listAdminICandidates() : [];

  return json({
    needsSetup,
    candidates,
    currentUserId: locals.userId ?? null,
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isAdminI(locals.userRole)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await needsAdminIISetup())) {
    return json({ error: "Admin II is already set up." }, { status: 409 });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await promoteAdminIToAdminII(body.targetUserId);
  if (!result.ok) {
    return json({ error: result.error }, { status: result.status });
  }

  const actor = auditActorFromLocals(locals);
  await recordAudit(actor, {
    action: "admin_ii.bootstrap",
    entityType: "user",
    entityId: body.targetUserId,
    summary: `Designated ${result.email} as Admin II (initial setup)`,
    details: { targetUserId: body.targetUserId },
  });

  const promotedSelf = body.targetUserId === locals.userId;

  return json({
    ok: true,
    email: result.email,
    promotedSelf,
  });
};
