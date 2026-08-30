export const userRole = ["ADMIN_I", "ADMIN_II", "USER", "TRAINEE"] as const;

export const roleElevationStatus = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export type RoleElevationStatus = (typeof roleElevationStatus)[number];
export type UserRole = (typeof userRole)[number];

export const appLocale = ["en", "tl"] as const;
export type AppLocale = (typeof appLocale)[number];

export const visitStatus = ["OPEN", "CLOSED"] as const;
export type VisitStatus = (typeof visitStatus)[number];

export const procedurePricingMode = [
  "FIXED",
  "PER_UNIT",
  "MANUAL",
  "BY_LEVEL",
] as const;
export type ProcedurePricingMode = (typeof procedurePricingMode)[number];

export const paymentStatus = ["PENDING", "COMPLETED", "VOIDED"] as const;
export type PaymentStatus = (typeof paymentStatus)[number];

export const correctionRequestType = ["PROCEDURE_VOID"] as const;
export type CorrectionRequestType = (typeof correctionRequestType)[number];

export const correctionRequestStatus = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export type CorrectionRequestStatus =
  (typeof correctionRequestStatus)[number];

/** Why a closed-visit procedure line was voided (shown on audit / printed records). */
export const procedureVoidCategory = ["ERROR", "REFUNDED"] as const;
export type ProcedureVoidCategory = (typeof procedureVoidCategory)[number];

/** What a dental certificate attests to. */
export const certificatePurpose = [
  "FIT_TO_WORK",
  "FIT_TO_STUDY",
  "OTHER",
] as const;
export type CertificatePurpose = (typeof certificatePurpose)[number];

/** How the return-to-work / return-to-school clearance is expressed. */
export const certificateResumeMode = [
  "DATE",
  "AFTER_DAYS",
  "AS_TOLERATED",
] as const;
export type CertificateResumeMode = (typeof certificateResumeMode)[number];

/** How a patient file is filed: radiographs, clinical photos, scanned paperwork. */
export const patientDocumentKind = [
  "XRAY",
  "PHOTO",
  "DOCUMENT",
  "OTHER",
] as const;
export type PatientDocumentKind = (typeof patientDocumentKind)[number];
