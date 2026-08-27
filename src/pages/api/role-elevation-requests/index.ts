import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { roleElevationRequests, users } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canApproveRoleElevation,
  canManageUsers,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import {
  ADMIN_II_REQUEST_PENDING_MESSAGE,
  ADMIN_II_SLOT_FULL_MESSAGE,
  adminIISlotStatus,
} from "@/lib/admin-ii-policy";
import { listRoleElevationRequests } from "@/lib/role-elevation-query";

function iso(d: Date | number): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = forbidUnless(canApproveRoleElevation(locals.userRole));
  if (denied) return denied;

  const statusParam = url.searchParams.get("status");
  const status =
    statusParam === "PENDING" ||
    statusParam === "APPROVED" ||
    statusParam === "REJECTED"
      ? statusParam
      : undefined;

  const [rows, slot] = await Promise.all([
    listRoleElevationRequests({ status }),
    adminIISlotStatus(),
  ]);
  return json({
    adminIISlot: slot,
    requests: rows.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      resolutionNote: r.resolutionNote,
      createdAt: iso(r.createdAt),
      resolvedAt: r.resolvedAt ? iso(r.resolvedAt) : null,
      targetUserId: r.targetUserId,
      targetEmail: r.targetEmail,
      requesterEmail: r.requesterEmail,
    })),
  });
};

const postSchema = z.object({
  targetUserId: z.string().min(1),
  reason: z.string().trim().min(8).max(2000),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = forbidUnless(canManageUsers(locals.userRole));
  if (denied) return denied;
  if (!locals.userId) return json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const target = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, body.targetUserId))
    .limit(1);
  if (!target[0]) return json({ error: "User not found" }, { status: 404 });
  if (target[0].role === "ADMIN_II") {
    return json({ error: "User already has Admin II access" }, { status: 400 });
  }
  if (target[0].role === "ADMIN_I") {
    return json({ error: "Admin I accounts do not need elevation" }, { status: 400 });
  }

  const slot = await adminIISlotStatus();
  if (slot.hasAdminII) {
    return json({ error: ADMIN_II_SLOT_FULL_MESSAGE }, { status: 409 });
  }
  if (!slot.canRequestAdminII) {
    return json({ error: ADMIN_II_REQUEST_PENDING_MESSAGE }, { status: 409 });
  }

  const pending = await db
    .select({ id: roleElevationRequests.id })
    .from(roleElevationRequests)
    .where(
      and(
        eq(roleElevationRequests.targetUserId, body.targetUserId),
        eq(roleElevationRequests.status, "PENDING"),
      ),
    )
    .limit(1);
  if (pending[0]) {
    return json(
      { error: "A pending Admin II request already exists for this user" },
      { status: 409 },
    );
  }

  const now = new Date();
  const [row] = await db
    .insert(roleElevationRequests)
    .values({
      targetUserId: body.targetUserId,
      requestedByUserId: locals.userId,
      status: "PENDING",
      reason: body.reason,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: roleElevationRequests.id });

  await recordAudit(auditActorFromLocals(locals), {
    action: "role_elevation.created",
    entityType: "role_elevation_request",
    entityId: row.id,
    summary: `Requested Admin II for ${target[0].email}`,
    details: { targetUserId: body.targetUserId },
  });

  return json({ ok: true, id: row.id }, { status: 201 });
};
