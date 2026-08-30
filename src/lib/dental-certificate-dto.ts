import type {
  CertificatePurpose,
  CertificateResumeMode,
} from "@/db/schema.shared";

/** A completed procedure the clinic can attest to on a certificate. */
export type CertifiableProcedure = {
  lineId: string;
  visitId: string;
  name: string;
  detail: string | null;
  performedOn: string;
};

export type CertificateLineItem = {
  id: string;
  lineId: string | null;
  name: string;
  detail: string | null;
  performedOn: string | null;
  sortOrder: number;
};

export type CertificateSummary = {
  id: string;
  patientId: string;
  visitId: string | null;
  certificateNumber: number;
  issuedAt: string;
  purpose: CertificatePurpose;
  purposeDetail: string | null;
  resumeMode: CertificateResumeMode;
  resumeDate: string | null;
  resumeDays: number | null;
  remarks: string | null;
  lineCount: number;
  createdAt: string;
};

export type CertificateDetail = CertificateSummary & {
  lines: CertificateLineItem[];
};

export const CERTIFICATE_PURPOSE_OPTIONS = [
  { value: "FIT_TO_WORK", label: "Fit to work" },
  { value: "FIT_TO_STUDY", label: "Fit to study" },
  { value: "OTHER", label: "Other purpose…" },
] as const;

export const CERTIFICATE_RESUME_OPTIONS = [
  { value: "DATE", label: "On a specific date" },
  { value: "AFTER_DAYS", label: "After a number of days" },
  { value: "AS_TOLERATED", label: "As tolerated" },
] as const;

/** Headline shown on the printed certificate, e.g. "FIT TO WORK". */
export function certificatePurposeHeadline(
  purpose: CertificatePurpose,
  purposeDetail: string | null,
): string {
  if (purpose === "FIT_TO_WORK") return "FIT TO WORK";
  if (purpose === "FIT_TO_STUDY") return "FIT TO STUDY";
  return (purposeDetail?.trim() || "FIT FOR THE PURPOSE STATED").toUpperCase();
}

/** The activity the patient returns to, used in the resume sentence. */
export function certificateActivityNoun(purpose: CertificatePurpose): string {
  if (purpose === "FIT_TO_STUDY") return "school";
  if (purpose === "FIT_TO_WORK") return "work";
  return "normal activities";
}

export function certificatePurposeLabel(
  purpose: CertificatePurpose,
  purposeDetail: string | null,
): string {
  const found = CERTIFICATE_PURPOSE_OPTIONS.find((o) => o.value === purpose);
  if (purpose === "OTHER") {
    return purposeDetail?.trim() || "Other purpose";
  }
  return found?.label ?? purpose;
}
