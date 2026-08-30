import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  dentalCertificateLines,
  dentalCertificates,
  procedureCatalog,
  visitProcedureLines,
  visits,
} from "@/db/schema";
import type {
  CertificatePurpose,
  CertificateResumeMode,
} from "@/db/schema.shared";
import type {
  CertifiableProcedure,
  CertificateDetail,
  CertificateSummary,
} from "@/lib/dental-certificate-dto";
import { toManilaDateKey } from "@/lib/manila-date";
import { parseManilaBirthDateYmdToUtcMs } from "@/lib/patient-age";
import { activeProcedureLine } from "@/lib/procedure-line-filters";
import { parseToothNumbersJson } from "@/lib/teeth";

function tsToIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }
  return new Date().toISOString();
}

function parseIssuedAt(input: string): Date | null {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const ms = parseManilaBirthDateYmdToUtcMs(trimmed);
    return ms != null ? new Date(ms) : null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export async function allocateCertificateNumber(): Promise<number> {
  const [{ max }] = await db
    .select({
      max: sql<number>`coalesce(max(${dentalCertificates.certificateNumber}), 0)`,
    })
    .from(dentalCertificates);
  return (max ?? 0) + 1;
}

/**
 * Every non-voided procedure recorded for the patient, newest first, so the
 * dentist can certify work from this visit or from an earlier one.
 */
export async function listCertifiableProcedures(
  patientId: string,
): Promise<CertifiableProcedure[]> {
  const rows = await db
    .select({
      lineId: visitProcedureLines.id,
      visitId: visitProcedureLines.visitId,
      quantity: visitProcedureLines.quantity,
      levelLabel: visitProcedureLines.procedureLevelLabelSnapshot,
      toothNumbersJson: visitProcedureLines.toothNumbersJson,
      catalogName: procedureCatalog.name,
      visitDate: visits.visitDate,
    })
    .from(visitProcedureLines)
    .innerJoin(
      procedureCatalog,
      eq(visitProcedureLines.catalogId, procedureCatalog.id),
    )
    .innerJoin(visits, eq(visitProcedureLines.visitId, visits.id))
    .where(and(eq(visits.patientId, patientId), activeProcedureLine()))
    .orderBy(desc(visits.visitDate), desc(visitProcedureLines.createdAt));

  return rows.map((row) => {
    const teeth = parseToothNumbersJson(row.toothNumbersJson);
    const parts: string[] = [];
    if (row.levelLabel?.trim()) parts.push(row.levelLabel.trim());
    if (teeth && teeth.length > 0) {
      parts.push(
        teeth.length === 1
          ? `tooth ${teeth[0]}`
          : `teeth ${teeth.join(", ")}`,
      );
    }
    if ((row.quantity ?? 1) > 1) parts.push(`x${row.quantity}`);

    return {
      lineId: row.lineId,
      visitId: row.visitId,
      name: row.catalogName,
      detail: parts.length > 0 ? parts.join(" · ") : null,
      performedOn: toManilaDateKey(new Date(tsToIso(row.visitDate))),
    };
  });
}

function rowToSummary(
  row: typeof dentalCertificates.$inferSelect,
  lineCount: number,
): CertificateSummary {
  return {
    id: row.id,
    patientId: row.patientId,
    visitId: row.visitId,
    certificateNumber: row.certificateNumber,
    issuedAt: tsToIso(row.issuedAt),
    purpose: row.purpose as CertificatePurpose,
    purposeDetail: row.purposeDetail,
    resumeMode: row.resumeMode as CertificateResumeMode,
    resumeDate: row.resumeDate,
    resumeDays: row.resumeDays,
    remarks: row.remarks,
    lineCount,
    createdAt: tsToIso(row.createdAt),
  };
}

export async function listCertificatesForPatient(
  patientId: string,
): Promise<CertificateSummary[]> {
  const rows = await db
    .select()
    .from(dentalCertificates)
    .where(eq(dentalCertificates.patientId, patientId))
    .orderBy(desc(dentalCertificates.issuedAt), desc(dentalCertificates.createdAt));

  if (rows.length === 0) return [];

  const counts = await db
    .select({ certificateId: dentalCertificateLines.certificateId })
    .from(dentalCertificateLines)
    .where(
      inArray(
        dentalCertificateLines.certificateId,
        rows.map((r) => r.id),
      ),
    );

  const countById = new Map<string, number>();
  for (const row of counts) {
    countById.set(
      row.certificateId,
      (countById.get(row.certificateId) ?? 0) + 1,
    );
  }

  return rows.map((row) => rowToSummary(row, countById.get(row.id) ?? 0));
}

export async function getCertificateDetail(
  certificateId: string,
): Promise<CertificateDetail | null> {
  const rows = await db
    .select()
    .from(dentalCertificates)
    .where(eq(dentalCertificates.id, certificateId))
    .limit(1);
  const cert = rows[0];
  if (!cert) return null;

  const lines = await db
    .select()
    .from(dentalCertificateLines)
    .where(eq(dentalCertificateLines.certificateId, certificateId))
    .orderBy(
      asc(dentalCertificateLines.sortOrder),
      asc(dentalCertificateLines.createdAt),
    );

  return {
    ...rowToSummary(cert, lines.length),
    lines: lines.map((line, index) => ({
      id: line.id,
      lineId: line.lineId,
      name: line.nameSnapshot,
      detail: line.detailSnapshot,
      performedOn: line.performedOn,
      sortOrder: line.sortOrder ?? index,
    })),
  };
}

export type CreateCertificateInput = {
  patientId: string;
  visitId?: string | null;
  issuedAt: string;
  purpose: CertificatePurpose;
  purposeDetail?: string | null;
  resumeMode: CertificateResumeMode;
  resumeDate?: string | null;
  resumeDays?: number | null;
  remarks?: string | null;
  lineIds: string[];
  createdByUserId?: string | null;
};

export async function createCertificate(
  input: CreateCertificateInput,
): Promise<CertificateDetail> {
  const issuedAt = parseIssuedAt(input.issuedAt);
  if (!issuedAt) throw new Error("Invalid certificate date");

  if (input.purpose === "OTHER" && !input.purposeDetail?.trim()) {
    throw new Error("Describe what the certificate is for");
  }

  if (input.resumeMode === "DATE") {
    if (!input.resumeDate?.trim()) {
      throw new Error("Choose the date the patient may resume");
    }
  }
  if (input.resumeMode === "AFTER_DAYS") {
    const days = input.resumeDays ?? 0;
    if (!Number.isFinite(days) || days < 1) {
      throw new Error("Enter how many days of rest are advised");
    }
  }

  if (input.visitId) {
    const visitRows = await db
      .select({ id: visits.id, patientId: visits.patientId })
      .from(visits)
      .where(eq(visits.id, input.visitId))
      .limit(1);
    const visit = visitRows[0];
    if (!visit) throw new Error("Visit not found");
    if (visit.patientId !== input.patientId) {
      throw new Error("Visit does not belong to this patient");
    }
  }

  // Snapshot the wording now so later edits to a procedure never change an
  // already-issued certificate.
  const available = await listCertifiableProcedures(input.patientId);
  const byLineId = new Map(available.map((p) => [p.lineId, p]));
  const chosen = input.lineIds.map((id) => {
    const procedure = byLineId.get(id);
    if (!procedure) {
      throw new Error("One or more procedures are invalid for this patient");
    }
    return procedure;
  });

  const certificateNumber = await allocateCertificateNumber();

  const inserted = await db
    .insert(dentalCertificates)
    .values({
      patientId: input.patientId,
      visitId: input.visitId ?? null,
      certificateNumber,
      issuedAt,
      purpose: input.purpose,
      purposeDetail:
        input.purpose === "OTHER"
          ? (input.purposeDetail?.trim() ?? null)
          : null,
      resumeMode: input.resumeMode,
      resumeDate:
        input.resumeMode === "DATE" ? (input.resumeDate?.trim() ?? null) : null,
      resumeDays:
        input.resumeMode === "AFTER_DAYS"
          ? Math.floor(input.resumeDays ?? 0)
          : null,
      remarks: input.remarks?.trim() || null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();

  const cert = inserted[0];

  if (chosen.length > 0) {
    await db.insert(dentalCertificateLines).values(
      chosen.map((procedure, index) => ({
        certificateId: cert.id,
        lineId: procedure.lineId,
        nameSnapshot: procedure.name,
        detailSnapshot: procedure.detail,
        performedOn: procedure.performedOn,
        sortOrder: index,
      })),
    );
  }

  const detail = await getCertificateDetail(cert.id);
  if (!detail) throw new Error("Failed to load created certificate");
  return detail;
}
