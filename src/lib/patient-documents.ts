import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { patientDocuments } from "@/db/schema";
import type { PatientDocumentKind } from "@/db/schema";
import {
  isImageMimeType,
  type PatientDocumentSummary,
} from "@/lib/patient-document-dto";

function tsToIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }
  return new Date().toISOString();
}

export function documentRowToSummary(row: {
  id: string;
  patientId: string;
  visitId: string | null;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  takenOn: string | null;
  createdAt: Date | number;
}): PatientDocumentSummary {
  return {
    id: row.id,
    patientId: row.patientId,
    visitId: row.visitId,
    kind: row.kind as PatientDocumentKind,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    caption: row.caption,
    takenOn: row.takenOn,
    isImage: isImageMimeType(row.mimeType),
    fileUrl: `/api/patient-documents/${row.id}/file`,
    createdAt: tsToIso(row.createdAt),
  };
}

/** Column list that deliberately omits `dataBase64` to keep listings light. */
const summaryColumns = {
  id: patientDocuments.id,
  patientId: patientDocuments.patientId,
  visitId: patientDocuments.visitId,
  kind: patientDocuments.kind,
  fileName: patientDocuments.fileName,
  mimeType: patientDocuments.mimeType,
  sizeBytes: patientDocuments.sizeBytes,
  caption: patientDocuments.caption,
  takenOn: patientDocuments.takenOn,
  createdAt: patientDocuments.createdAt,
};

export async function listPatientDocuments(
  patientId: string,
  visitId?: string | null,
): Promise<PatientDocumentSummary[]> {
  const where = visitId
    ? and(
        eq(patientDocuments.patientId, patientId),
        eq(patientDocuments.visitId, visitId),
      )
    : eq(patientDocuments.patientId, patientId);

  const rows = await db
    .select(summaryColumns)
    .from(patientDocuments)
    .where(where)
    .orderBy(desc(patientDocuments.createdAt));

  return rows.map(documentRowToSummary);
}
