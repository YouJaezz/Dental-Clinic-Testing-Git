import type { APIRoute } from "astro";
import { desc, eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { roleElevationRequests, users } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  ADMIN_II_REQUEST_PENDING_MESSAGE,
  ADMIN_II_SLOT_FULL_MESSAGE,
  adminIISlotStatus,
} from "@/lib/admin-ii-policy";
import { hashPassword } from "@/lib/auth-server";
import { canManageUsers, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ locals }) => {
  const denied = forbidUnless(canManageUsers(locals.userRole));
  if (denied) return denied;
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
  const slot = await adminIISlotStatus();
  return json({ users: rows, currentUserId: locals.userId, adminIISlot: slot });
};

const creatableRoles = ["USER", "TRAINEE"] as const;

const createSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.enum(creatableRoles),
  requestAdminII: z.boolean().optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = forbidUnless(canManageUsers(locals.userRole));
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.requestAdminII) {
    const slot = await adminIISlotStatus();
    if (slot.hasAdminII) {
      return json({ error: ADMIN_II_SLOT_FULL_MESSAGE }, { status: 409 });
    }
    if (!slot.canRequestAdminII) {
      return json({ error: ADMIN_II_REQUEST_PENDING_MESSAGE }, { status: 409 });
    }
  }

  const email = parsed.data.email.toLowerCase();
  const dup = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (dup[0]) {
    return json({ error: "Email already in use" }, { status: 409 });
  }

  const inserted = await db
    .insert(users)
    .values({
      email,
      passwordHash: hashPassword(parsed.data.password),
      role: parsed.data.role,
    })
    .returning();

  const row = inserted[0]!;
  await recordAudit(auditActorFromLocals(locals), {
    action: "user.created",
    entityType: "user",
    entityId: row.id,
    summary: `Created user ${row.email} (${row.role})`,
    details: { email: row.email, role: row.role },
  });

  if (parsed.data.requestAdminII && locals.userId) {
    const now = new Date();
    await db.insert(roleElevationRequests).values({
      targetUserId: row.id,
      requestedByUserId: locals.userId,
      status: "PENDING",
      reason: `Admin II access requested when creating account ${row.email}`,
      createdAt: now,
      updatedAt: now,
    });
  }

  return json(
    {
      user: {
        id: row.id,
        email: row.email,
        role: row.role,
        createdAt: row.createdAt,
      },
      adminIIRequested: Boolean(parsed.data.requestAdminII),
    },
    { status: 201 },
  );
};
