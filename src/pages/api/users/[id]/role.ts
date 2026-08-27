import type { APIRoute } from "astro";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { canChangeUserRoles, forbidUnless } from "@/lib/authz";
import {
  isRoleAssignableByAdminII,
  ROLES_ASSIGNABLE_BY_ADMIN_II,
} from "@/lib/user-roles";
import { json } from "@/lib/http-api";

const bodySchema = z.object({
  role: z.enum(ROLES_ASSIGNABLE_BY_ADMIN_II),
});

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canChangeUserRoles(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error:
          "Invalid role. Admin II can only assign USER, TRAINEE, or Admin I.",
      },
      { status: 400 },
    );
  }

  const target = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target[0]) return json({ error: "Not found" }, { status: 404 });

  if (target[0].id === locals.userId) {
    return json({ error: "You cannot change your own role" }, { status: 400 });
  }

  if (target[0].role === "ADMIN_II") {
    return json(
      { error: "Admin II accounts cannot be changed here" },
      { status: 400 },
    );
  }

  if (target[0].role === "ADMIN_I" && parsed.data.role !== "ADMIN_I") {
    const [{ c }] = await db
      .select({ c: count() })
      .from(users)
      .where(eq(users.role, "ADMIN_I"));
    if (c <= 1) {
      return json(
        { error: "Cannot demote the only Admin I account" },
        { status: 409 },
      );
    }
  }

  await db
    .update(users)
    .set({ role: parsed.data.role })
    .where(eq(users.id, id));

  await recordAudit(auditActorFromLocals(locals), {
    action: "user.role_changed",
    entityType: "user",
    entityId: id,
    summary: `Changed role for ${target[0].email} from ${target[0].role} to ${parsed.data.role}`,
    details: { from: target[0].role, to: parsed.data.role },
  });

  return json({
    user: { id: target[0].id, email: target[0].email, role: parsed.data.role },
  });
};
