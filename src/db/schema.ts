import { isPostgres } from "./provider";
import * as pg from "./schema.pg";
import * as sqlite from "./schema.sqlite";

const active = isPostgres() ? pg : sqlite;

export const users = active.users;
export const auditLogs = active.auditLogs;
export const adminGate = active.adminGate;
export const blockedDevices = active.blockedDevices;
export const roleElevationRequests = active.roleElevationRequests;
export const devOtpChallenges = active.devOtpChallenges;
export const sessions = active.sessions;
export const patients = active.patients;
export const visits = active.visits;
export const procedureCatalog = active.procedureCatalog;
export const visitProcedureLines = active.visitProcedureLines;
export const medicineCatalog = active.medicineCatalog;
export const prescriptions = active.prescriptions;
export const prescriptionLines = active.prescriptionLines;
export const patientDocuments = active.patientDocuments;
export const visitPayments = active.visitPayments;
export const correctionRequests = active.correctionRequests;

export const usersRelations = active.usersRelations;
export const sessionsRelations = active.sessionsRelations;
export const patientsRelations = active.patientsRelations;
export const visitsRelations = active.visitsRelations;
export const procedureCatalogRelations = active.procedureCatalogRelations;
export const visitProcedureLinesRelations = active.visitProcedureLinesRelations;
export const medicineCatalogRelations = active.medicineCatalogRelations;
export const prescriptionsRelations = active.prescriptionsRelations;
export const prescriptionLinesRelations = active.prescriptionLinesRelations;
export const patientDocumentsRelations = active.patientDocumentsRelations;
export const visitPaymentsRelations = active.visitPaymentsRelations;
export const correctionRequestsRelations = active.correctionRequestsRelations;

export {
  appLocale,
  correctionRequestStatus,
  correctionRequestType,
  patientDocumentKind,
  procedureVoidCategory,
  paymentStatus,
  procedurePricingMode,
  roleElevationStatus,
  userRole,
  visitStatus,
} from "./schema.shared";
export type {
  AppLocale,
  RoleElevationStatus,
  CorrectionRequestStatus,
  CorrectionRequestType,
  PatientDocumentKind,
  ProcedureVoidCategory,
  PaymentStatus,
  ProcedurePricingMode,
  UserRole,
  VisitStatus,
} from "./schema.shared";
