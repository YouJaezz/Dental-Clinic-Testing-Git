import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { Patient, Role, Summary, Visit } from "@/lib/clinical-types";
import { formatMedicalHistorySummary } from "@/lib/medical-history";
import { formatCents } from "@/lib/money";
import { formatManilaDateLong } from "@/lib/manila-date";
import {
  formatVisitSelectLabel,
  formatVisitTicketNumber,
} from "@/lib/visit-ticket";
import { resolvePatientDateOfBirthDisplay } from "@/lib/patient-age";
import {
  getLocationSearch,
  parseWorkspaceQuery,
  replaceUrlQuery,
} from "@/lib/workspace-url";
import { WorkspaceHistoryPreview } from "@/components/WorkspaceHistoryPreview";
import {
  VisitCloseConfirmDialog,
  VisitDeleteConfirmDialog,
  VisitStartConfirmDialog,
} from "@/components/WorkspaceVisitDialogs";
import type { VisitDeletePreview } from "@/lib/visit-delete";
import { VisitOpenBlockDialog } from "@/components/VisitOpenBlockDialog";
import { useLocale } from "@/lib/use-locale";

export function WorkspaceOverview(props: { initialRole: Role }) {
  const { t } = useLocale();
  const role = props.initialRole;
  const canWrite =
    role === "ADMIN_I" || role === "ADMIN_II" || role === "USER";
  const canDeleteVisit = role === "ADMIN_I" || role === "ADMIN_II";
  const canCloseAndStart = role === "ADMIN_I" || role === "ADMIN_II";
  const showVisitTickets = role === "ADMIN_II";

  const [patientId, setPatientId] = useState<string | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openBlockOpen, setOpenBlockOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [startBlockSummary, setStartBlockSummary] = useState<Summary | null>(
    null,
  );
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePreview, setDeletePreview] = useState<VisitDeletePreview | null>(
    null,
  );
  const [deleteUnderstood, setDeleteUnderstood] = useState(false);

  function syncFromUrl() {
    const { patientId: p, visitId: v } = parseWorkspaceQuery(getLocationSearch());
    setPatientId(p);
    setVisitId(v);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    syncFromUrl();
    const onQ = () => syncFromUrl();
    window.addEventListener("popstate", onQ);
    window.addEventListener("clinicalhub:query", onQ);
    return () => {
      window.removeEventListener("popstate", onQ);
      window.removeEventListener("clinicalhub:query", onQ);
    };
  }, []);

  const loadPatient = useCallback(async (pid: string) => {
    const { ok, data } = await api<{ patient: Patient }>(`/api/patients/${pid}`);
    if (ok) setPatient(data.patient);
    else setPatient(null);
  }, []);

  useEffect(() => {
    if (!patientId) {
      setPatient(null);
      return;
    }
    void loadPatient(patientId);
  }, [patientId, loadPatient]);

  useEffect(() => {
    const onPatientUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ patientId?: string }>).detail;
      if (detail?.patientId && detail.patientId === patientId) {
        void loadPatient(detail.patientId);
      }
    };
    window.addEventListener("clinicalhub:patient-updated", onPatientUpdated);
    return () =>
      window.removeEventListener("clinicalhub:patient-updated", onPatientUpdated);
  }, [patientId, loadPatient]);

  const loadVisits = useCallback(async (pid: string): Promise<Visit[]> => {
    const { ok, data } = await api<{ visits: Visit[] }>(
      `/api/patients/${pid}/visits`,
    );
    if (!ok) {
      setErr((data as { error?: string }).error ?? "Failed to load visits");
      setVisits([]);
      return [];
    }
    const list = data.visits.map((v) => ({
      ...v,
      ticketNumber: v.ticketNumber,
      visitDate:
        typeof v.visitDate === "string"
          ? v.visitDate
          : new Date(v.visitDate as unknown as number).toISOString(),
    }));
    setVisits(list);
    return list;
  }, []);

  useEffect(() => {
    if (!patientId) {
      setVisits([]);
      setVisitId(null);
      setSummary(null);
      return;
    }
    void (async () => {
      const list = await loadVisits(patientId);
      const fromUrl = parseWorkspaceQuery(getLocationSearch()).visitId;
      const nextVisit =
        (fromUrl && list.some((v) => v.id === fromUrl) ? fromUrl : null) ??
        list.find((v) => v.status === "OPEN")?.id ??
        list[0]?.id ??
        null;
      setVisitId(nextVisit);
      replaceUrlQuery("/workspace", patientId, nextVisit);
    })();
  }, [patientId, loadVisits]);

  const loadSummary = useCallback(async (vid: string) => {
    const { ok, data } = await api<Summary>(`/api/visits/${vid}/summary`);
    if (!ok) {
      setSummary(null);
      return;
    }
    setSummary(data);
  }, []);

  useEffect(() => {
    if (!visitId) {
      setSummary(null);
      return;
    }
    void loadSummary(visitId);
  }, [visitId, loadSummary]);

  const openVisits = visits.filter((v) => v.status === "OPEN");
  const selectedVisit = visits.find((v) => v.id === visitId) ?? null;
  const selectedIsOpen = selectedVisit?.status === "OPEN";

  async function requestStartVisit() {
    if (!patientId || !canWrite || busy) return;
    if (openVisits.length > 0) {
      setErr(null);
      if (!canCloseAndStart) {
        setOpenBlockOpen(true);
        return;
      }
      const previewId =
        openVisits.find((v) => v.id === visitId)?.id ?? openVisits[0]?.id;
      if (previewId) {
        const { ok, data } = await api<Summary>(
          `/api/visits/${previewId}/summary`,
        );
        setStartBlockSummary(ok ? data : null);
      } else {
        setStartBlockSummary(null);
      }
      setStartConfirmOpen(true);
      return;
    }
    void startVisit();
  }

  async function startVisit(opts?: { closeExistingOpenVisits?: boolean }) {
    if (!patientId || !canWrite) return;
    setStartConfirmOpen(false);
    setStartBlockSummary(null);
    setBusy(true);
    setErr(null);
    const { ok, data, status } = await api<{ visit: Visit; error?: string }>(
      `/api/patients/${patientId}/visits`,
      {
        method: "POST",
        body: JSON.stringify(
          opts?.closeExistingOpenVisits
            ? { closeExistingOpenVisits: true }
            : {},
        ),
      },
    );
    setBusy(false);
    if (!ok) {
      if (status === 409) {
        const list = await loadVisits(patientId);
        if (list.some((v) => v.status === "OPEN")) {
          setStartConfirmOpen(true);
        }
      }
      setErr((data as { error?: string }).error ?? "Could not start visit");
      return;
    }
    const id = data.visit.id;
    await loadVisits(patientId);
    setVisitId(id);
    replaceUrlQuery("/workspace", patientId, id);
    void loadSummary(id);
  }

  async function closeExistingAndStartNew() {
    await startVisit({ closeExistingOpenVisits: true });
  }

  function requestCloseVisit() {
    if (!visitId || !canWrite || busy || !selectedIsOpen) return;
    setCloseConfirmOpen(true);
  }

  async function closeVisit() {
    if (!visitId || !canWrite) return;
    setCloseConfirmOpen(false);
    setBusy(true);
    setErr(null);
    const { ok, data, status } = await api<{ visit: Visit; error?: string }>(
      `/api/visits/${visitId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "CLOSED",
          confirmClose: true,
        }),
      },
    );
    setBusy(false);
    if (!ok) {
      setErr((data as { error?: string }).error ?? "Could not close visit");
      if (status === 409) setCloseConfirmOpen(true);
      return;
    }
    if (patientId) {
      const list = await loadVisits(patientId);
      const next =
        list.find((v) => v.status === "OPEN")?.id ?? list[0]?.id ?? null;
      setVisitId(next);
      replaceUrlQuery("/workspace", patientId, next);
      if (next) void loadSummary(next);
      else setSummary(null);
    }
  }

  async function openDeleteVisitDialog() {
    if (!visitId || !canDeleteVisit || busy) return;
    setDeleteUnderstood(false);
    setErr(null);
    const { ok, data } = await api<{ preview: VisitDeletePreview }>(
      `/api/visits/${visitId}`,
    );
    if (!ok) {
      setErr(
        (data as { error?: string }).error ?? "Could not load visit details",
      );
      return;
    }
    setDeletePreview(data.preview);
    setDeleteConfirmOpen(true);
  }

  async function deleteVisit() {
    if (!visitId || !canDeleteVisit || !deletePreview) return;
    setBusy(true);
    setErr(null);
    const { ok, data } = await api<{ ok?: boolean; error?: string }>(
      `/api/visits/${visitId}`,
      {
        method: "DELETE",
        body: JSON.stringify({ confirmDelete: true }),
      },
    );
    setBusy(false);
    if (!ok) {
      setErr((data as { error?: string }).error ?? "Could not delete visit");
      return;
    }
    setDeleteConfirmOpen(false);
    setDeletePreview(null);
    setDeleteUnderstood(false);
    if (patientId) {
      const list = await loadVisits(patientId);
      const next =
        list.find((v) => v.status === "OPEN")?.id ?? list[0]?.id ?? null;
      setVisitId(next);
      replaceUrlQuery("/workspace", patientId, next);
      if (next) void loadSummary(next);
      else setSummary(null);
    }
  }

  function onVisitChange(id: string) {
    const v = id || null;
    setVisitId(v);
    if (patientId) replaceUrlQuery("/workspace", patientId, v);
  }

  if (!patientId) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p className="mb-4">No patient selected.</p>
        <Button asChild variant="secondary">
          <a href="/patients">Choose a patient</a>
        </Button>
      </div>
    );
  }

  const patientLabel = patient
    ? `${patient.lastName}, ${patient.firstName}`
    : "this patient";

  return (
    <div className="space-y-6">
      <VisitOpenBlockDialog
        open={openBlockOpen}
        onOpenChange={setOpenBlockOpen}
      />
      <VisitStartConfirmDialog
        open={startConfirmOpen}
        openVisits={openVisits}
        summary={startBlockSummary}
        busy={busy}
        onOpenChange={(open) => {
          setStartConfirmOpen(open);
          if (!open) setStartBlockSummary(null);
        }}
        onCloseExistingAndStart={() => void closeExistingAndStartNew()}
      />
      <VisitCloseConfirmDialog
        open={closeConfirmOpen}
        role={role}
        summary={summary}
        busy={busy}
        onOpenChange={setCloseConfirmOpen}
        onConfirm={() => void closeVisit()}
      />
      <VisitDeleteConfirmDialog
        open={deleteConfirmOpen}
        preview={deletePreview}
        patientLabel={patientLabel}
        busy={busy}
        understood={deleteUnderstood}
        onUnderstoodChange={setDeleteUnderstood}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setDeletePreview(null);
            setDeleteUnderstood(false);
          }
        }}
        onConfirm={() => void deleteVisit()}
      />

      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {patient ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="rounded-lg border bg-card p-4 text-sm shadow-sm">
            <h2 className="mb-2 text-base font-semibold">
              {patient.lastName}, {patient.firstName}
            </h2>
            <dl className="grid gap-1 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Date of birth</dt>
                <dd>
                  {(() => {
                    const dob = resolvePatientDateOfBirthDisplay(
                      patient.dateOfBirth,
                      patient.age,
                    );
                    if (!dob.ymd) return "—";
                    return (
                      <>
                        {formatManilaDateLong(dob.ymd)}
                        {dob.isEstimated ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Approximate (from recorded age). Set the exact date
                            under Patients → Edit.
                          </span>
                        ) : null}
                      </>
                    );
                  })()}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gender</dt>
                <dd>{patient.gender ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Civil status</dt>
                <dd>{patient.civilStatus ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Age</dt>
                <dd className="text-muted-foreground">{patient.age ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="whitespace-pre-wrap">{patient.address ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Contact #</dt>
                <dd>{patient.contactNumber ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Medical history</dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">
                  {formatMedicalHistorySummary(patient.medicalHistory)}
                </dd>
              </div>
            </dl>
          </div>

          <WorkspaceHistoryPreview
            patientId={patientId}
            currentVisitId={visitId}
            showVisitTickets={showVisitTickets}
          />
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Patient context is carried in the URL. Use the tabs above for procedures,
        record, and payment.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => void requestStartVisit()}
          disabled={!canWrite || busy}
        >
          {t("visit.startNew")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => requestCloseVisit()}
          disabled={!canWrite || !visitId || busy || !selectedIsOpen}
          title={
            selectedVisit && !selectedIsOpen
              ? "This visit is already closed"
              : undefined
          }
        >
          {t("visit.closeCurrent")}
        </Button>
        {canDeleteVisit ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => void openDeleteVisitDialog()}
            disabled={!visitId || busy}
          >
            {t("visit.deleteVisit")}
          </Button>
        ) : null}
        <Button asChild variant="ghost">
          <a href="/patients">{t("visit.changePatient")}</a>
        </Button>
      </div>

      {openVisits.length > 0 ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {openVisits.length === 1
            ? t("visit.oneOpenHint")
            : t("visit.manyOpenHint", { count: openVisits.length })}
        </p>
      ) : null}

      {selectedVisit && !selectedIsOpen ? (
        <p className="text-xs text-muted-foreground">
          {t("visit.selectedClosedHint")}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="visitSel">{t("visit.selectVisit").replace("…", "")}</Label>
        <select
          id="visitSel"
          className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={visitId ?? ""}
          onChange={(e) => onVisitChange(e.target.value)}
        >
          <option value="">{t("visit.selectVisit")}</option>
          {visits.map((v) => (
            <option key={v.id} value={v.id}>
              {formatVisitSelectLabel({
                ticketNumber: v.ticketNumber,
                visitDate: v.visitDate,
                status: v.status,
                showTicket: showVisitTickets,
              })}
            </option>
          ))}
        </select>
      </div>

      {summary && visitId ? (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          {showVisitTickets && visits.find((v) => v.id === visitId)?.ticketNumber != null &&
          (visits.find((v) => v.id === visitId)!.ticketNumber ?? 0) >= 1 ? (
            <p className="mb-2 font-mono text-xs font-semibold text-primary">
              Ticket{" "}
              {formatVisitTicketNumber(
                visits.find((v) => v.id === visitId)!.ticketNumber,
              )}
            </p>
          ) : null}
          <p className="text-muted-foreground">
            {t("visit.charges")}{" "}
            <strong>{formatCents(summary.chargesCents)}</strong> ·{" "}
            {t("visit.paid")}{" "}
            <strong>{formatCents(summary.paidCents)}</strong> ·{" "}
            {t("visit.balance")}{" "}
            <strong className="text-foreground">
              {formatCents(summary.balanceCents)}
            </strong>
          </p>
        </div>
      ) : null}
    </div>
  );
}
