import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { patients } from "@/db/schema";
import { getCertificateDetail } from "@/lib/dental-certificates";
import {
  computeAgeFromBirthMs,
  parseManilaBirthDateYmdToUtcMs,
} from "@/lib/patient-age";
import { patientRowToPublic } from "@/lib/patient-dto";
import { parseCanonicalPatientGender } from "@/lib/patient-gender";

export async function loadCertificatePrint(certificateId: string) {
  const certificate = await getCertificateDetail(certificateId);
  if (!certificate) return null;

  const patientRows = await db
    .select()
    .from(patients)
    .where(eq(patients.id, certificate.patientId))
    .limit(1);
  const patientRow = patientRows[0];
  if (!patientRow) return null;

  const patient = patientRowToPublic(patientRow);
  const dobMs = patient.dateOfBirth
    ? parseManilaBirthDateYmdToUtcMs(patient.dateOfBirth)
    : null;
  const age = dobMs != null ? computeAgeFromBirthMs(dobMs) : patient.age;

  return {
    certificate,
    patient: {
      ...patient,
      displayAge: age,
      displayGender:
        parseCanonicalPatientGender(patient.gender) ?? patient.gender,
    },
  };
}
