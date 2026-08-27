import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  appLocale,
  correctionRequestStatus,
  correctionRequestType,
  roleElevationStatus,
  paymentStatus,
  procedurePricingMode,
  procedureVoidCategory,
  userRole,
  visitStatus,
} from "./schema.shared";

export {
  appLocale,
  correctionRequestStatus,
  correctionRequestType,
  roleElevationStatus,
  paymentStatus,
  procedurePricingMode,
  procedureVoidCategory,
  userRole,
  visitStatus,
} from "./schema.shared";
export type {
  AppLocale,
  CorrectionRequestStatus,
  CorrectionRequestType,
  RoleElevationStatus,
  ProcedureVoidCategory,
  PaymentStatus,
  ProcedurePricingMode,
  UserRole,
  VisitStatus,
} from "./schema.shared";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

const tsOptional = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: userRole }).notNull().default("USER"),
  locale: text("locale", { enum: appLocale }).notNull().default("en"),
  createdAt: ts("created_at").$defaultFn(() => new Date()),
}, (t) => ({
  roleIdx: index("users_role_idx").on(t.role),
}));

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
    actorUserId: text("actor_user_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    detailsJson: text("details_json"),
  },
  (t) => ({
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
    actionIdx: index("audit_logs_action_idx").on(t.action),
  }),
);

export const adminGate = pgTable("admin_gate", {
  id: text("id").primaryKey(),
  codeHash: text("code_hash").notNull(),
  cookieSecret: text("cookie_secret"),
  updatedAt: ts("updated_at").$defaultFn(() => new Date()),
  updatedByUserId: text("updated_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
});

export const blockedDevices = pgTable(
  "blocked_devices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ipAddress: text("ip_address"),
    deviceLabel: text("device_label"),
    reason: text("reason").notNull(),
    blockedByUserId: text("blocked_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
  },
  (t) => ({
    ipIdx: index("blocked_devices_ip_idx").on(t.ipAddress),
    labelIdx: index("blocked_devices_label_idx").on(t.deviceLabel),
  }),
);

export const roleElevationRequests = pgTable(
  "role_elevation_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status", { enum: roleElevationStatus })
      .notNull()
      .default("PENDING"),
    reason: text("reason").notNull(),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: tsOptional("resolved_at"),
    resolutionNote: text("resolution_note"),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").$defaultFn(() => new Date()),
  },
  (t) => ({
    statusIdx: index("role_elevation_requests_status_idx").on(t.status),
    targetIdx: index("role_elevation_requests_target_user_id_idx").on(
      t.targetUserId,
    ),
  }),
);

export const devOtpChallenges = pgTable(
  "dev_otp_challenges",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    expiresAt: ts("expires_at"),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
  },
  (t) => ({
    userIdx: index("dev_otp_challenges_user_id_idx").on(t.userId),
    expiresIdx: index("dev_otp_challenges_expires_at_idx").on(t.expiresAt),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    deviceLabel: text("device_label"),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
  },
  (t) => ({
    userIdx: index("sessions_user_id_idx").on(t.userId),
    createdAtIdx: index("sessions_created_at_idx").on(t.createdAt),
    expiresAtIdx: index("sessions_expires_at_idx").on(t.expiresAt),
  }),
);

export const patients = pgTable(
  "patients",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    contactNumber: text("contact_number"),
    dateOfBirth: tsOptional("date_of_birth"),
    age: integer("age"),
    gender: text("gender"),
    civilStatus: text("civil_status"),
    address: text("address"),
    medicalHistory: text("medical_history"),
    notes: text("notes"),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
    deletedAt: tsOptional("deleted_at"),
  },
  (t) => ({
    lastNameIdx: index("patients_last_name_idx").on(t.lastName),
    activeCreatedIdx: index("patients_active_created_idx").on(
      t.deletedAt,
      t.createdAt,
    ),
  }),
);

export const visits = pgTable(
  "visits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    patientId: text("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    visitDate: ts("visit_date"),
    status: text("status", { enum: visitStatus }).notNull().default("OPEN"),
    ticketNumber: integer("ticket_number").notNull(),
    notes: text("notes"),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
  },
  (t) => ({
    patientIdx: index("visits_patient_id_idx").on(t.patientId),
    statusIdx: index("visits_status_idx").on(t.status),
    visitDateIdx: index("visits_visit_date_idx").on(t.visitDate),
    ticketNumberIdx: index("visits_ticket_number_idx").on(t.ticketNumber),
  }),
);

export const procedureCatalog = pgTable("procedure_catalog", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  code: text("code"),
  name: text("name").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  pricingMode: text("pricing_mode", { enum: procedurePricingMode })
    .notNull()
    .default("FIXED"),
  levelPricesJson: text("level_prices_json"),
  dentistNotes: text("dentist_notes"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").$defaultFn(() => new Date()),
});

export const visitProcedureLines = pgTable(
  "visit_procedure_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    visitId: text("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    catalogId: text("catalog_id")
      .notNull()
      .references(() => procedureCatalog.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceCentsSnapshot: integer("unit_price_cents_snapshot").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    procedureLevelIdSnapshot: text("procedure_level_id_snapshot"),
    procedureLevelLabelSnapshot: text("procedure_level_label_snapshot"),
    toothNumbersJson: text("tooth_numbers_json"),
    lineNotes: text("line_notes"),
    voidedAt: ts("voided_at"),
    voidedByUserId: text("voided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    voidReason: text("void_reason"),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
  },
  (t) => ({
    visitIdx: index("visit_procedure_lines_visit_id_idx").on(t.visitId),
  }),
);

export const correctionRequests = pgTable(
  "correction_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: text("type", { enum: correctionRequestType }).notNull(),
    status: text("status", { enum: correctionRequestStatus })
      .notNull()
      .default("PENDING"),
    visitId: text("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    lineId: text("line_id").notNull(),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: ts("resolved_at"),
    resolutionNote: text("resolution_note"),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").$defaultFn(() => new Date()),
  },
  (t) => ({
    statusIdx: index("correction_requests_status_idx").on(t.status),
    lineIdx: index("correction_requests_line_id_idx").on(t.lineId),
  }),
);

export const medicineCatalog = pgTable("medicine_catalog", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  code: text("code"),
  name: text("name").notNull(),
  defaultDose: text("default_dose"),
  defaultInstructions: text("default_instructions"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").$defaultFn(() => new Date()),
});

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    patientId: text("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    visitId: text("visit_id").references(() => visits.id, {
      onDelete: "set null",
    }),
    prescriptionNumber: integer("prescription_number").notNull(),
    prescribedAt: ts("prescribed_at"),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
  },
  (t) => ({
    numberIdx: index("prescriptions_number_idx").on(t.prescriptionNumber),
    patientIdx: index("prescriptions_patient_id_idx").on(t.patientId),
    visitIdx: index("prescriptions_visit_id_idx").on(t.visitId),
    prescribedAtIdx: index("prescriptions_prescribed_at_idx").on(t.prescribedAt),
  }),
);

export const prescriptionLines = pgTable(
  "prescription_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    prescriptionId: text("prescription_id")
      .notNull()
      .references(() => prescriptions.id, { onDelete: "cascade" }),
    catalogId: text("catalog_id")
      .notNull()
      .references(() => medicineCatalog.id, { onDelete: "restrict" }),
    nameSnapshot: text("name_snapshot").notNull(),
    doseStrength: text("dose_strength"),
    instructions: text("instructions"),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
  },
  (t) => ({
    prescriptionIdx: index("prescription_lines_prescription_id_idx").on(
      t.prescriptionId,
    ),
  }),
);

export const visitPayments = pgTable(
  "visit_payments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    visitId: text("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").notNull(),
    status: text("status", { enum: paymentStatus })
      .notNull()
      .default("COMPLETED"),
    reference: text("reference"),
    recordedByUserId: text("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recordedAt: ts("recorded_at").$defaultFn(() => new Date()),
  },
  (t) => ({
    visitIdx: index("visit_payments_visit_id_idx").on(t.visitId),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  paymentsRecorded: many(visitPayments),
  correctionRequestsFiled: many(correctionRequests, {
    relationName: "requester",
  }),
  correctionRequestsResolved: many(correctionRequests, {
    relationName: "resolver",
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const patientsRelations = relations(patients, ({ many }) => ({
  visits: many(visits),
  prescriptions: many(prescriptions),
}));

export const visitsRelations = relations(visits, ({ one, many }) => ({
  patient: one(patients, {
    fields: [visits.patientId],
    references: [patients.id],
  }),
  procedureLines: many(visitProcedureLines),
  payments: many(visitPayments),
  correctionRequests: many(correctionRequests),
  prescriptions: many(prescriptions),
}));

export const correctionRequestsRelations = relations(
  correctionRequests,
  ({ one }) => ({
    visit: one(visits, {
      fields: [correctionRequests.visitId],
      references: [visits.id],
    }),
    requester: one(users, {
      fields: [correctionRequests.requestedByUserId],
      references: [users.id],
      relationName: "requester",
    }),
    resolver: one(users, {
      fields: [correctionRequests.resolvedByUserId],
      references: [users.id],
      relationName: "resolver",
    }),
  }),
);

export const procedureCatalogRelations = relations(
  procedureCatalog,
  ({ many }) => ({
    lines: many(visitProcedureLines),
  }),
);

export const visitProcedureLinesRelations = relations(
  visitProcedureLines,
  ({ one }) => ({
    visit: one(visits, {
      fields: [visitProcedureLines.visitId],
      references: [visits.id],
    }),
    catalog: one(procedureCatalog, {
      fields: [visitProcedureLines.catalogId],
      references: [procedureCatalog.id],
    }),
  }),
);

export const visitPaymentsRelations = relations(visitPayments, ({ one }) => ({
  visit: one(visits, {
    fields: [visitPayments.visitId],
    references: [visits.id],
  }),
  recordedBy: one(users, {
    fields: [visitPayments.recordedByUserId],
    references: [users.id],
  }),
}));

export const medicineCatalogRelations = relations(medicineCatalog, ({ many }) => ({
  prescriptionLines: many(prescriptionLines),
}));

export const prescriptionsRelations = relations(
  prescriptions,
  ({ one, many }) => ({
    patient: one(patients, {
      fields: [prescriptions.patientId],
      references: [patients.id],
    }),
    visit: one(visits, {
      fields: [prescriptions.visitId],
      references: [visits.id],
    }),
    createdBy: one(users, {
      fields: [prescriptions.createdByUserId],
      references: [users.id],
    }),
    lines: many(prescriptionLines),
  }),
);

export const prescriptionLinesRelations = relations(
  prescriptionLines,
  ({ one }) => ({
    prescription: one(prescriptions, {
      fields: [prescriptionLines.prescriptionId],
      references: [prescriptions.id],
    }),
    catalog: one(medicineCatalog, {
      fields: [prescriptionLines.catalogId],
      references: [medicineCatalog.id],
    }),
  }),
);
