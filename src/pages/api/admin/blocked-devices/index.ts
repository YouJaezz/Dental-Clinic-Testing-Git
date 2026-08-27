import type { APIRoute } from "astro";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { blockedDevices, users } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { canManageDeviceBlocks, forbidUnless } from "@/lib/authz";
import { blockDevice } from "@/lib/device-block";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async ({ locals }) => {
  const denied = forbidUnless(canManageDeviceBlocks(locals.userRole));
  if (denied) return denied;

  const rows = await db
    .select({
      id: blockedDevices.id,
      ipAddress: blockedDevices.ipAddress,
      deviceLabel: blockedDevices.deviceLabel,
      reason: blockedDevices.reason,
      createdAt: blockedDevices.createdAt,
      blockedByEmail: users.email,
    })
    .from(blockedDevices)
    .innerJoin(users, eq(blockedDevices.blockedByUserId, users.id))
    .orderBy(desc(blockedDevices.createdAt))
    .limit(200);

  return json({
    blocks: rows.map((r) => ({
      ...r,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date(r.createdAt).toISOString(),
    })),
  });
};

const postSchema = z.object({
  ipAddress: z.string().trim().optional().nullable(),
  deviceLabel: z.string().trim().optional().nullable(),
  reason: z.string().trim().min(3).max(500),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = forbidUnless(canManageDeviceBlocks(locals.userRole));
  if (denied) return denied;
  if (!locals.userId) return json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const result = await blockDevice({
      ipAddress: body.ipAddress,
      deviceLabel: body.deviceLabel,
      reason: body.reason,
      blockedByUserId: locals.userId,
    });

    await recordAudit(auditActorFromLocals(locals), {
      action: "device.blocked",
      entityType: "blocked_device",
      entityId: result.id,
      summary: `Blocked device${body.ipAddress ? ` IP ${body.ipAddress}` : ""}${body.deviceLabel ? ` (${body.deviceLabel})` : ""}`,
      details: {
        ipAddress: body.ipAddress,
        deviceLabel: body.deviceLabel,
        revokedSessions: result.revokedSessions,
      },
    });

    return json({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Could not block device" },
      { status: 400 },
    );
  }
};
