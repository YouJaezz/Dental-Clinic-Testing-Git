import type { UserRole } from "@/db/schema";
import { json } from "@/lib/http-api";

const STAFF_ROLES: readonly UserRole[] = [
  "ADMIN_I",
  "ADMIN_II",
  "USER",
  "TRAINEE",
];

export function isAdminI(role: UserRole | undefined): boolean {
  return role === "ADMIN_I";
}

export function isAdminII(role: UserRole | undefined): boolean {
  return role === "ADMIN_II";
}

/** Admin I or Admin II — clinic administration areas. */
export function isAdminLike(role: UserRole | undefined): boolean {
  return isAdminI(role) || isAdminII(role);
}

export function canReadClinicalData(role: UserRole | undefined): boolean {
  return role != null && STAFF_ROLES.includes(role);
}

export function canViewAnalytics(role: UserRole | undefined): boolean {
  return isAdminLike(role);
}

export function canViewDailySales(role: UserRole | undefined): boolean {
  return isAdminI(role) || isAdminII(role) || role === "USER";
}

export function canPickDailySalesDate(role: UserRole | undefined): boolean {
  return isAdminLike(role);
}

export function canMutateClinicalData(role: UserRole | undefined): boolean {
  return isAdminI(role) || isAdminII(role) || role === "USER";
}

export function canCloseOpenVisitToStartNew(role: UserRole | undefined): boolean {
  return isAdminLike(role);
}

export function canArchivePatients(role: UserRole | undefined): boolean {
  return isAdminLike(role);
}

export function canManageCatalog(role: UserRole | undefined): boolean {
  return isAdminI(role);
}

/** User accounts, catalog — Admin I only. */
export function canManageUsers(role: UserRole | undefined): boolean {
  return isAdminI(role);
}

/** Reopen visits, delete audit entries, view devices — Admin II only. */
export function canUseAdvancedAdmin(role: UserRole | undefined): boolean {
  return isAdminII(role);
}

export function canReopenVisits(role: UserRole | undefined): boolean {
  return isAdminII(role);
}

export function canDeleteAuditLogs(role: UserRole | undefined): boolean {
  return isAdminII(role);
}

/** Change USER / TRAINEE / ADMIN_I roles — Admin II only. */
export function canChangeUserRoles(role: UserRole | undefined): boolean {
  return isAdminII(role);
}

export function canManageDeviceBlocks(role: UserRole | undefined): boolean {
  return isAdminII(role);
}

/** List users for role management (Admin II). */
export function canViewUsersForRoleManagement(role: UserRole | undefined): boolean {
  return isAdminII(role);
}

export function canDeleteVisits(role: UserRole | undefined): boolean {
  return isAdminLike(role);
}

export function canManageCorrectionRequests(role: UserRole | undefined): boolean {
  return isAdminI(role);
}

export function canApproveRoleElevation(role: UserRole | undefined): boolean {
  return isAdminI(role);
}

export function canSubmitCorrectionRequests(role: UserRole | undefined): boolean {
  return role === "USER" || role === "TRAINEE";
}

export function canVoidClosedProcedureLines(role: UserRole | undefined): boolean {
  return isAdminLike(role);
}

export function forbidUnless(allowed: boolean): Response | null {
  if (allowed) return null;
  return json({ error: "Forbidden" }, { status: 403 });
}
