import { and, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { roleElevationRequests, users } from "@/db/schema";

export async function countAdminIIUsers(): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, "ADMIN_II"));
  return n ?? 0;
}

export async function countPendingAdminIIRequests(): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(roleElevationRequests)
    .where(eq(roleElevationRequests.status, "PENDING"));
  return n ?? 0;
}

/** Only one Admin II account; at most one pending request while the slot is open. */
export async function adminIISlotStatus(): Promise<{
  hasAdminII: boolean;
  pendingRequestCount: number;
  canRequestAdminII: boolean;
}> {
  const [adminIICount, pendingCount] = await Promise.all([
    countAdminIIUsers(),
    countPendingAdminIIRequests(),
  ]);
  const hasAdminII = adminIICount > 0;
  const canRequestAdminII = !hasAdminII && pendingCount === 0;
  return {
    hasAdminII,
    pendingRequestCount: pendingCount,
    canRequestAdminII,
  };
}

export const ADMIN_II_SLOT_FULL_MESSAGE =
  "There is already an Admin II account. Only one Admin II is allowed.";

export const ADMIN_II_REQUEST_PENDING_MESSAGE =
  "An Admin II request is already waiting for approval.";
