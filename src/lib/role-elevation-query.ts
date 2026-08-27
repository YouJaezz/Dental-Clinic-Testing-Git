import { and, count, desc, eq } from "drizzle-orm";
import { alias as pgAlias } from "drizzle-orm/pg-core";
import { alias as sqliteAlias } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import { isPostgres } from "@/db/provider";
import { roleElevationRequests, users } from "@/db/schema";
import { isMissingSchemaError } from "@/lib/db-errors";

function userAliases() {
  const alias = isPostgres() ? pgAlias : sqliteAlias;
  return {
    target: alias(users, "target_user"),
    requester: alias(users, "requester_user"),
  };
}

export async function countPendingRoleElevationRequests(): Promise<number> {
  try {
    const [{ pendingCount }] = await db
      .select({ pendingCount: count() })
      .from(roleElevationRequests)
      .where(eq(roleElevationRequests.status, "PENDING"));
    return pendingCount ?? 0;
  } catch (e) {
    if (isMissingSchemaError(e)) return 0;
    throw e;
  }
}

export type RoleElevationListRow = {
  id: string;
  status: string;
  reason: string;
  resolutionNote: string | null;
  createdAt: Date | number;
  resolvedAt: Date | number | null;
  targetUserId: string;
  targetEmail: string;
  requesterEmail: string;
};

export async function listRoleElevationRequests(params: {
  status?: "PENDING" | "APPROVED" | "REJECTED";
}): Promise<RoleElevationListRow[]> {
  try {
    const { target, requester } = userAliases();
    const conditions = [];
    if (params.status) {
      conditions.push(eq(roleElevationRequests.status, params.status));
    }

    return await db
      .select({
        id: roleElevationRequests.id,
        status: roleElevationRequests.status,
        reason: roleElevationRequests.reason,
        resolutionNote: roleElevationRequests.resolutionNote,
        createdAt: roleElevationRequests.createdAt,
        resolvedAt: roleElevationRequests.resolvedAt,
        targetUserId: roleElevationRequests.targetUserId,
        targetEmail: target.email,
        requesterEmail: requester.email,
      })
      .from(roleElevationRequests)
      .innerJoin(target, eq(roleElevationRequests.targetUserId, target.id))
      .innerJoin(
        requester,
        eq(roleElevationRequests.requestedByUserId, requester.id),
      )
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(roleElevationRequests.createdAt))
      .limit(100);
  } catch (e) {
    if (isMissingSchemaError(e)) return [];
    throw e;
  }
}
