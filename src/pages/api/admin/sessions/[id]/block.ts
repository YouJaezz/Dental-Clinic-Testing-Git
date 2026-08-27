import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { canManageDeviceBlocks, forbidUnless } from "@/lib/authz";
import { blockDevice } from "@/lib/device-block";
import { json } from "@/lib/http-api";

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const POST: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canManageDeviceBlocks(locals.userRole));
  if (denied) return denied;
  if (!locals.userId) return json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = params.id;
  if (!sessionId) return json({ error: "Missing session id" }, { status: 400 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return json({ error: "Invalid body" }, { status: 400 });
  }

  const row = await db
    .select({
      ipAddress: sessions.ipAddress,
      deviceLabel: sessions.deviceLabel,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row[0]) return json({ error: "Session not found" }, { status: 404 });

  try {
    const result = await blockDevice({
      ipAddress: row[0].ipAddress,
      deviceLabel: row[0].deviceLabel,
      reason: body.reason,
      blockedByUserId: locals.userId,
    });

    await recordAudit(auditActorFromLocals(locals), {
      action: "device.blocked",
      entityType: "blocked_device",
      entityId: result.id,
      summary: `Blocked session ${sessionId}`,
      details: {
        sessionId,
        ipAddress: row[0].ipAddress,
        deviceLabel: row[0].deviceLabel,
        revokedSessions: result.revokedSessions,
      },
    });

    return json({ ok: true, ...result });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Could not block device" },
      { status: 400 },
    );
  }
};
