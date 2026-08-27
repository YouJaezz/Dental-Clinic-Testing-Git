/** Sta.Isabel Dental Clinic — brand tokens (also wired in globals.css). */
export const CLINIC_NAME = "Sta.Isabel Dental Clinic";
export const CLINIC_DOCTOR = "Dra. Rizzallen C. Sta.Isabel";
/** Printed credential line (e.g. patient history / receipts). */
export const CLINIC_DOCTOR_CREDENTIAL = "Rizzallen C. Sta. Isabel, DMD";
export const CLINIC_DOCTOR_LICENSE_NO = "0053299";
export const CLINIC_SERVICES =
  "General Dentistry • Orthodontics • Oral Surgery";
export const CLINIC_ADDRESS =
  "81A. Mabini St., Burgos, Rodriguez, Rizal";
export const CLINIC_FACEBOOK = "Sta.Isabel Dental Clinic";
export const CLINIC_PHONE = "09706935897";

/** Primary logo (place file in /public). */
export const CLINIC_LOGO_SRC = "/clinic-logo.png";

/** UI palette — white-first; blush for actions, pink for highlights. */
export const CLINIC_COLORS = {
  white: "#FFFFFF",
  surface: "#F8F9FA",
  border: "#E4E7EC",
  text: "#1E293B",
  textMuted: "#64748B",
  /** Buttons, active nav, strong accents */
  primary: "#EFAAC4",
  /** Soft highlights, tints, table headers */
  highlight: "#FFC4D1",
  sage: "#D4DCCD",
  blush: "#EFAAC4",
  pink: "#FFC4D1",
} as const;
