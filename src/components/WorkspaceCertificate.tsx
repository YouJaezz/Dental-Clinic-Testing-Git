import { useEffect, useState } from "react";
import { DentalCertificateManager } from "@/components/DentalCertificateManager";
import { api } from "@/lib/api-client";
import type { Patient, Role } from "@/lib/clinical-types";
import { useWorkspaceContext } from "@/lib/use-workspace-context";

export function WorkspaceCertificate(props: { initialRole: Role }) {
  const { patientId, visitId, resolving } = useWorkspaceContext();
  const [patient, setPatient] = useState<Patient | null>(null);

  useEffect(() => {
    if (!patientId) {
      setPatient(null);
      return;
    }
    void (async () => {
      const { ok, data } = await api<{ patient: Patient }>(
        `/api/patients/${patientId}`,
      );
      if (ok) setPatient(data.patient);
    })();
  }, [patientId]);

  if (resolving) {
    return <p className="text-sm text-muted-foreground">Loading workspace…</p>;
  }

  if (!patientId) {
    return (
      <p className="text-sm text-muted-foreground">
        Open a patient from Patients or Ongoing visits, then return here to
        issue a dental certificate.
      </p>
    );
  }

  return (
    <DentalCertificateManager
      initialRole={props.initialRole}
      patientId={patientId}
      visitId={visitId}
      patient={patient}
    />
  );
}
