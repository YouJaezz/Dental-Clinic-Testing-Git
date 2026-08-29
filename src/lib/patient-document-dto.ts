import type { PatientDocumentKind } from "@/db/schema.shared";

/** Metadata only — the base64 payload is never included in list responses. */
export type PatientDocumentSummary = {
  id: string;
  patientId: string;
  visitId: string | null;
  kind: PatientDocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  takenOn: string | null;
  isImage: boolean;
  fileUrl: string;
  createdAt: string;
};

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "application/pdf",
] as const;

export function isAllowedDocumentMimeType(mimeType: string): boolean {
  return (ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
