export type Role = "ADMIN_I" | "ADMIN_II" | "USER" | "TRAINEE";

export type ProcedureLevelTier = {
  id: string;
  label: string;
  unitPriceCents: number;
};

export type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  contactNumber: string | null;
  /** Manila calendar yyyy-MM-dd when set */
  dateOfBirth: string | null;
  /** Derived from date of birth when set; legacy rows may only have stored age */
  age: number | null;
  gender: string | null;
  civilStatus: string | null;
  address: string | null;
  medicalHistory: string | null;
  notes: string | null;
  createdAt: string;
};

export type Visit = {
  id: string;
  patientId: string;
  visitDate: string;
  status: "OPEN" | "CLOSED";
  ticketNumber: number;
  notes: string | null;
};

export type CatalogItem = {
  id: string;
  code: string | null;
  name: string;
  unitPriceCents: number;
  pricingMode: "FIXED" | "PER_UNIT" | "MANUAL" | "BY_LEVEL";
  levelPrices: ProcedureLevelTier[];
  dentistNotes: string | null;
  active: boolean;
};

export type VisitChargeLine = {
  id: string;
  catalogName: string;
  quantity: number;
  lineTotalCents: number;
  createdAt: string;
};

export type VisitPaymentRow = {
  id: string;
  amountCents: number;
  method: string;
  reference: string | null;
  recordedAt: string;
};

export type Summary = {
  visitId: string;
  visitDate: string;
  visitStatus: "OPEN" | "CLOSED";
  chargesCents: number;
  paidCents: number;
  balanceCents: number;
  chargeLines: VisitChargeLine[];
  payments: VisitPaymentRow[];
};

export type UserRow = {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
};
