import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { roleElevationRequests, users } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { invalidateAdminIISetupCache } from "@/lib/admin-ii-bootstrap";
import {
  ADMIN_II_SLOT_FULL_MESSAGE,
  countAdminIIUsers,
} from "@/lib/admin-ii-policy";
import { canApproveRoleElevation, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

const patchSchema = z.object({
  action: z.enum(["approve", "reject"]),
  resolutionNote: z.string().trim().max(2000).optional(),
});

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canApproveRoleElevation(locals.userRole));
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
    .from(roleElevationRequests)
    .where(eq(roleElevationRequests.id, id))
    .limit(1);
  if (!row[0]) return json({ error: "Not found" }, { status: 404 });
  if (row[0].status !== "PENDING") {
    return json({ error: "Request is no longer pending" }, { status: 400 });
  }

  const target = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, row[0].targetUserId))
    .limit(1);
  if (!target[0]) return json({ error: "Target user not found" }, { status: 404 });

  const now = new Date();
  const actor = auditActorFromLocals(locals);
  const note = body.resolutionNote?.trim() || null;

  if (body.action === "reject") {
    await db
      .update(roleElevationRequests)
      .set({
        status: "REJECTED",
        resolvedByUserId: locals.userId ?? null,
        resolvedAt: now,
        resolutionNote: note,
        updatedAt: now,
      })
      .where(eq(roleElevationRequests.id, id));

    await recordAudit(actor, {
      action: "role_elevation.rejected",
      entityType: "role_elevation_request",
      entityId: id,
      summary: `Rejected Admin II request for ${target[0].email}`,
    });

    return json({ ok: true, status: "REJECTED" });
  }

  if ((await countAdminIIUsers()) > 0) {
    return json({ error: ADMIN_II_SLOT_FULL_MESSAGE }, { status: 409 });
  }

  await db
    .update(users)
    .set({ role: "ADMIN_II" })
    .where(eq(users.id, target[0].id));

  invalidateAdminIISetupCache();

  await db
    .update(roleElevationRequests)
    .set({
      status: "APPROVED",
      resolvedByUserId: locals.userId ?? null,
      resolvedAt: now,
      resolutionNote: note,
      updatedAt: now,
    })
    .where(eq(roleElevationRequests.id, id));

  await recordAudit(actor, {
    action: "role_elevation.approved",
    entityType: "role_elevation_request",
    entityId: id,
    summary: `Granted Admin II to ${target[0].email}`,
    details: { targetUserId: target[0].id },
  });

  return json({ ok: true, status: "APPROVED" });
};
