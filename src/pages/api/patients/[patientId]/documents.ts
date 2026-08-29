import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { patientDocuments, patients, visits } from "@/db/schema";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canMutateClinicalData,
  canReadClinicalData,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import {
  documentRowToSummary,
  listPatientDocuments,
} from "@/lib/patient-documents";
import {
  formatFileSize,
  isAllowedDocumentMimeType,
  MAX_DOCUMENT_BYTES,
} from "@/lib/patient-document-dto";
import { patientDocumentKind } from "@/db/schema";

async function patientExists(patientId: string): Promise<boolean> {
  const rows = await db
    .select({ id: patients.id })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);
  return rows[0] != null;
}

export const GET: APIRoute = async ({ params, url, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const patientId = params.patientId?.trim();
  if (!patientId) return json({ error: "Missing patientId" }, { status: 400 });
  if (!(await patientExists(patientId))) {
    return json({ error: "Patient not found" }, { status: 404 });
  }

  const visitId = url.searchParams.get("visitId")?.trim() || null;
  const documents = await listPatientDocuments(patientId, visitId);
  return json({ documents });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canMutateClinicalData(locals.userRole));
  if (denied) return denied;

  const patientId = params.patientId?.trim();
  if (!patientId) return json({ error: "Missing patientId" }, { status: 400 });
  if (!(await patientExists(patientId))) {
    return json({ error: "Patient not found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected a file upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: "Choose a file to upload" }, { status: 400 });
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return json(
      {
        error: `File is too large (${formatFileSize(file.size)}). The limit is ${formatFileSize(MAX_DOCUMENT_BYTES)}.`,
      },
      { status: 413 },
    );
  }

  const mimeType = (file.type || "").toLowerCase();
  if (!isAllowedDocumentMimeType(mimeType)) {
    return json(
      { error: "Only images (JPG, PNG, WEBP, GIF, BMP, TIFF) and PDF files are allowed." },
      { status: 415 },
    );
  }

  const rawKind = String(form.get("kind") ?? "XRAY").toUpperCase();
  const kind = (patientDocumentKind as readonly string[]).includes(rawKind)
    ? rawKind
    : "XRAY";

  const caption = String(form.get("caption") ?? "").trim().slice(0, 300) || null;
  const takenOn = String(form.get("takenOn") ?? "").trim().slice(0, 10) || null;

  let visitId = String(form.get("visitId") ?? "").trim() || null;
  if (visitId) {
    const visitRows = await db
      .select({ id: visits.id, patientId: visits.patientId })
      .from(visits)
      .where(eq(visits.id, visitId))
      .limit(1);
    if (!visitRows[0] || visitRows[0].patientId !== patientId) {
      visitId = null;
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileName = (file.name || "upload").slice(-180);

  const inserted = await db
    .insert(patientDocuments)
    .values({
      patientId,
      visitId,
      kind,
      fileName,
      mimeType,
      sizeBytes: bytes.byteLength,
      caption,
      takenOn,
      dataBase64: bytes.toString("base64"),
      uploadedByUserId: locals.userId ?? null,
    })
    .returning();

  const row = inserted[0];
  const document = documentRowToSummary(row);

  await recordAudit(auditActorFromLocals(locals), {
    action: "patient_document.uploaded",
    entityType: "patient_document",
    entityId: document.id,
    summary: `Uploaded ${document.kind.toLowerCase()} "${document.fileName}" for patient ${patientId}`,
    details: {
      patientId,
      visitId,
      kind: document.kind,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
    },
  });

  return json({ document }, { status: 201 });
};
