import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  correctionRequests,
  patients,
  procedureCatalog,
  users,
  visitProcedureLines,
  visits,
} from "@/db/schema";
import { isMissingSchemaError } from "@/lib/db-errors";

export async function countPendingCorrectionRequests(): Promise<number> {
  try {
    const [{ pendingCount }] = await db
      .select({ pendingCount: count() })
      .from(correctionRequests)
      .where(eq(correctionRequests.status, "PENDING"));
    return pendingCount ?? 0;
  } catch (e) {
    if (isMissingSchemaError(e)) return 0;
    throw e;
  }
}

export async function listPendingLineIdsForVisit(
  visitId: string,
): Promise<string[]> {
  try {
    const rows = await db
      .select({ lineId: correctionRequests.lineId })
      .from(correctionRequests)
      .where(
        and(
          eq(correctionRequests.visitId, visitId),
          eq(correctionRequests.status, "PENDING"),
          eq(correctionRequests.type, "PROCEDURE_VOID"),
        ),
      );
    return rows.map((r) => r.lineId);
  } catch (e) {
    if (isMissingSchemaError(e)) return [];
    throw e;
  }
}

export type CorrectionRequestListRow = {
  id: string;
  type: string;
  status: string;
  visitId: string;
  lineId: string;
  reason: string;
  resolutionNote: string | null;
  createdAt: Date | number;
  updatedAt: Date | number;
  resolvedAt: Date | number | null;
  requesterEmail: string;
  patientFirstName: string;
  patientLastName: string;
  visitDate: string;
  catalogName: string | null;
  lineTotalCents: number | null;
};

export async function listCorrectionRequests(params: {
  status?: "PENDING" | "APPROVED" | "REJECTED";
  requestedByUserId?: string;
}): Promise<CorrectionRequestListRow[]> {
  try {
    const conditions = [eq(correctionRequests.type, "PROCEDURE_VOID")];
    if (params.status) {
      conditions.push(eq(correctionRequests.status, params.status));
    }
    if (params.requestedByUserId) {
      conditions.push(
        eq(correctionRequests.requestedByUserId, params.requestedByUserId),
      );
    }

    return await db
      .select({
        id: correctionRequests.id,
        type: correctionRequests.type,
        status: correctionRequests.status,
        visitId: correctionRequests.visitId,
        lineId: correctionRequests.lineId,
        reason: correctionRequests.reason,
        resolutionNote: correctionRequests.resolutionNote,
        createdAt: correctionRequests.createdAt,
        updatedAt: correctionRequests.updatedAt,
        resolvedAt: correctionRequests.resolvedAt,
        requesterEmail: users.email,
        patientFirstName: patients.firstName,
        patientLastName: patients.lastName,
        visitDate: visits.visitDate,
        catalogName: procedureCatalog.name,
        lineTotalCents: visitProcedureLines.lineTotalCents,
      })
      .from(correctionRequests)
      .innerJoin(visits, eq(correctionRequests.visitId, visits.id))
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .innerJoin(users, eq(correctionRequests.requestedByUserId, users.id))
      .leftJoin(
        visitProcedureLines,
        and(
          eq(visitProcedureLines.id, correctionRequests.lineId),
          eq(visitProcedureLines.visitId, correctionRequests.visitId),
        ),
      )
      .leftJoin(
        procedureCatalog,
        eq(visitProcedureLines.catalogId, procedureCatalog.id),
      )
      .where(and(...conditions))
      .orderBy(desc(correctionRequests.createdAt))
      .limit(100);
  } catch (e) {
    if (isMissingSchemaError(e)) return [];
    throw e;
  }
}
