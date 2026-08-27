import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { countAdminIIUsers } from "@/lib/admin-ii-policy";

export type AdminICandidate = {
  id: string;
  email: string;
};

const SETUP_CACHE_TTL_MS = 30_000;
let setupCache: { at: number; value: boolean } | null = null;

export function invalidateAdminIISetupCache(): void {
  setupCache = null;
}

export async function needsAdminIISetup(): Promise<boolean> {
  const now = Date.now();
  if (setupCache && now - setupCache.at < SETUP_CACHE_TTL_MS) {
    return setupCache.value;
  }
  const value = (await countAdminIIUsers()) === 0;
  setupCache = { at: now, value };
  return value;
}

export async function listAdminICandidates(): Promise<AdminICandidate[]> {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.role, "ADMIN_I"))
    .orderBy(users.email);
}

export async function promoteAdminIToAdminII(
  targetUserId: string,
): Promise<
  | { ok: true; email: string }
  | { ok: false; error: string; status: number }
> {
  if ((await countAdminIIUsers()) > 0) {
    return {
      ok: false,
      error: "An Admin II account already exists.",
      status: 409,
    };
  }

  const target = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target[0]) {
    return { ok: false, error: "User not found.", status: 404 };
  }
  if (target[0].role !== "ADMIN_I") {
    return {
      ok: false,
      error: "Only an Admin I account can be designated as Admin II.",
      status: 400,
    };
  }

  await db
    .update(users)
    .set({ role: "ADMIN_II" })
    .where(eq(users.id, target[0].id));

  invalidateAdminIISetupCache();

  return { ok: true, email: target[0].email };
}
