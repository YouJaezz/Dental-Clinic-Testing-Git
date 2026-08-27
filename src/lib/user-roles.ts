import type { UserRole } from "@/db/schema";

/** Roles Admin II may assign (not Admin II — that stays approval-only). */
export const ROLES_ASSIGNABLE_BY_ADMIN_II = [
  "USER",
  "TRAINEE",
  "ADMIN_I",
] as const satisfies readonly UserRole[];

export type RoleAssignableByAdminII =
  (typeof ROLES_ASSIGNABLE_BY_ADMIN_II)[number];

export function isRoleAssignableByAdminII(
  role: UserRole,
): role is RoleAssignableByAdminII {
  return (ROLES_ASSIGNABLE_BY_ADMIN_II as readonly UserRole[]).includes(role);
}
