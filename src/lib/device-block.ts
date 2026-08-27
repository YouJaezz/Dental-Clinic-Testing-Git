import { and, eq, gt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { blockedDevices, sessions } from "@/db/schema";

export type DeviceMeta = {
  ipAddress?: string | null;
  deviceLabel?: string | null;
};

function normIp(ip: string | null | undefined): string | null {
  const v = ip?.trim();
  return v || null;
}

function normLabel(label: string | null | undefined): string | null {
  const v = label?.trim();
  return v || null;
}

export async function isDeviceBlocked(meta: DeviceMeta): Promise<boolean> {
  const ip = normIp(meta.ipAddress);
  const label = normLabel(meta.deviceLabel);
  if (!ip && !label) return false;

  const conditions = [];
  if (ip) {
    conditions.push(eq(blockedDevices.ipAddress, ip));
  }
  if (label) {
    conditions.push(eq(blockedDevices.deviceLabel, label));
  }
  if (conditions.length === 0) return false;

  const row = await db
    .select({ id: blockedDevices.id })
    .from(blockedDevices)
    .where(or(...conditions))
    .limit(1);

  return Boolean(row[0]);
}

export async function revokeSessionsMatching(meta: DeviceMeta): Promise<number> {
  const ip = normIp(meta.ipAddress);
  const label = normLabel(meta.deviceLabel);
  const parts = [];
  if (ip) parts.push(eq(sessions.ipAddress, ip));
  if (label) parts.push(eq(sessions.deviceLabel, label));
  if (parts.length === 0) return 0;

  const now = new Date();
  const toRevoke = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(or(...parts), gt(sessions.expiresAt, now)));

  for (const s of toRevoke) {
    await db.delete(sessions).where(eq(sessions.id, s.id));
  }
  return toRevoke.length;
}

export async function blockDevice(params: {
  ipAddress?: string | null;
  deviceLabel?: string | null;
  reason: string;
  blockedByUserId: string;
}): Promise<{ id: string; revokedSessions: number }> {
  const ip = normIp(params.ipAddress);
  const label = normLabel(params.deviceLabel);
  if (!ip && !label) {
    throw new Error("Provide an IP address or device label to block");
  }

  const dupConditions = [];
  if (ip) dupConditions.push(eq(blockedDevices.ipAddress, ip));
  if (label) dupConditions.push(eq(blockedDevices.deviceLabel, label));

  const existing =
    dupConditions.length > 0
      ? await db
          .select({ id: blockedDevices.id })
          .from(blockedDevices)
          .where(or(...dupConditions))
          .limit(1)
      : [];

  let id: string;
  if (existing[0]) {
    id = existing[0].id;
  } else {
    const inserted = await db
      .insert(blockedDevices)
      .values({
        ipAddress: ip,
        deviceLabel: label,
        reason: params.reason.trim(),
        blockedByUserId: params.blockedByUserId,
      })
      .returning({ id: blockedDevices.id });
    id = inserted[0]!.id;
  }

  const revokedSessions = await revokeSessionsMatching({
    ipAddress: ip,
    deviceLabel: label,
  });

  return { id, revokedSessions };
}

export async function unblockDevice(id: string): Promise<boolean> {
  const result = await db
    .delete(blockedDevices)
    .where(eq(blockedDevices.id, id))
    .returning({ id: blockedDevices.id });
  return result.length > 0;
}
