import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { blockedDevices } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { canManageDeviceBlocks, forbidUnless } from "@/lib/authz";
import { unblockDevice } from "@/lib/device-block";
import { json } from "@/lib/http-api";

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canManageDeviceBlocks(locals.userRole));
  if (denied) return denied;

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const row = await db
    .select()
    .from(blockedDevices)
    .where(eq(blockedDevices.id, id))
    .limit(1);
  if (!row[0]) return json({ error: "Not found" }, { status: 404 });

  const ok = await unblockDevice(id);
  if (!ok) return json({ error: "Not found" }, { status: 404 });

  await recordAudit(auditActorFromLocals(locals), {
    action: "device.unblocked",
    entityType: "blocked_device",
    entityId: id,
    summary: `Unblocked device${row[0].ipAddress ? ` IP ${row[0].ipAddress}` : ""}`,
    details: {
      ipAddress: row[0].ipAddress,
      deviceLabel: row[0].deviceLabel,
    },
  });

  return json({ ok: true });
};
