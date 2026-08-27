import type { APIRoute } from "astro";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { canViewUsersForRoleManagement, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

/** User list for Admin II role management (no passwords / create). */
export const GET: APIRoute = async ({ locals }) => {
  const denied = forbidUnless(canViewUsersForRoleManagement(locals.userRole));
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

  return json({ users: rows, currentUserId: locals.userId });
};
