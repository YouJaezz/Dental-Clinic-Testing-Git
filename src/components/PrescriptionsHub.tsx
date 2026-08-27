import { useCallback, useEffect, useState } from "react";
import { PrescriptionManager } from "@/components/PrescriptionManager";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { Patient, Role } from "@/lib/clinical-types";
import {
  getLocationSearch,
  parseWorkspaceQuery,
  replaceUrlQuery,
} from "@/lib/workspace-url";

export function PrescriptionsHub(props: { initialRole: Role }) {
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientId, setPatientId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return parseWorkspaceQuery(getLocationSearch()).patientId;
  });

  const loadPatients = useCallback(async (q: string) => {
    setLoadingPatients(true);
    const params = new URLSearchParams({ page: "1", pageSize: "20" });
    if (q.trim()) params.set("q", q.trim());
    const { ok, data } = await api<{ patients: Patient[] }>(
      `/api/patients?${params.toString()}`,
    );
    setLoadingPatients(false);
    if (ok) setPatients(data.patients);
  }, []);

  useEffect(() => {
    void loadPatients(search);
  }, [loadPatients, search]);

  useEffect(() => {
    if (!patientId) {
      setSelectedPatient(null);
      return;
    }
    void (async () => {
      const { ok, data } = await api<{ patient: Patient }>(
        `/api/patients/${patientId}`,
      );
      if (ok) setSelectedPatient(data.patient);
    })();
  }, [patientId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      setPatientId(parseWorkspaceQuery(getLocationSearch()).patientId);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("clinicalhub:query", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("clinicalhub:query", sync);
    };
  }, []);

  function selectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setPatientId(patient.id);
    replaceUrlQuery("/prescriptions", patient.id, null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(240px,320px)_1fr]">
      <aside className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Select patient</h2>
        <Label htmlFor="rx-patient-search" className="sr-only">
          Search patients
        </Label>
        <Input
          id="rx-patient-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="mb-3"
        />
        {loadingPatients ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((patient) => {
                const active = patient.id === patientId;
                return (
                  <TableRow
                    key={patient.id}
                    className={active ? "bg-primary/10" : "cursor-pointer"}
                    onClick={() => selectPatient(patient)}
                  >
                    <TableCell>
                      {patient.lastName}, {patient.firstName}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </aside>

      <div>
        <PrescriptionManager
          initialRole={props.initialRole}
          patientId={patientId}
          patient={selectedPatient}
        />
      </div>
    </div>
  );
}
