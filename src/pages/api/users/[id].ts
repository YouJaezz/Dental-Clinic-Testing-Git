import type { APIRoute } from "astro";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { hashPassword } from "@/lib/auth-server";
import { canManageUsers, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

const resetSchema = z.object({
  newPassword: z.string().min(8),
});

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canManageUsers(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target[0]) {
    return json({ error: "Not found" }, { status: 404 });
  }

  await db
    .update(users)
    .set({ passwordHash: hashPassword(parsed.data.newPassword) })
    .where(eq(users.id, id));

  await db.delete(sessions).where(eq(sessions.userId, id));

  const actor = auditActorFromLocals(locals);
  await recordAudit(actor, {
    action: "user.password_reset",
    entityType: "user",
    entityId: id,
    summary: `Admin reset password for ${target[0].email}`,
    details: { targetEmail: target[0].email },
  });

  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canManageUsers(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  if (id === locals.userId) {
    return json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const target = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target[0]) {
    return json({ error: "Not found" }, { status: 404 });
  }

  if (target[0].role === "ADMIN_I") {
    const [{ c }] = await db
      .select({ c: count() })
      .from(users)
      .where(eq(users.role, "ADMIN_I"));
    if (c <= 1) {
      return json(
        { error: "Cannot delete the only Admin I account" },
        { status: 409 },
      );
    }
  }

  await db.delete(sessions).where(eq(sessions.userId, id));
  await db.delete(users).where(eq(users.id, id));

  const actor = auditActorFromLocals(locals);
  await recordAudit(actor, {
    action: "user.deleted",
    entityType: "user",
    entityId: id,
    summary: `Deleted user ${target[0].email}`,
    details: { email: target[0].email, role: target[0].role },
  });

  return json({ ok: true });
};
