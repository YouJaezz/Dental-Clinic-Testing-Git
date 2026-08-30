import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Printer, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CertificatePurpose,
  CertificateResumeMode,
} from "@/db/schema.shared";
import { api } from "@/lib/api-client";
import type { Patient, Role } from "@/lib/clinical-types";
import {
  CERTIFICATE_PURPOSE_OPTIONS,
  CERTIFICATE_RESUME_OPTIONS,
  certificatePurposeLabel,
  type CertifiableProcedure,
  type CertificateSummary,
} from "@/lib/dental-certificate-dto";
import { toManilaDateKey } from "@/lib/manila-date";

function todayManilaYmd(): string {
  return toManilaDateKey(new Date());
}

function formatYmd(iso: string): string {
  try {
    return toManilaDateKey(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function resumeLabel(cert: CertificateSummary): string {
  if (cert.resumeMode === "DATE" && cert.resumeDate) {
    return `Resumes ${cert.resumeDate}`;
  }
  if (cert.resumeMode === "AFTER_DAYS" && cert.resumeDays) {
    return `After ${cert.resumeDays} day${cert.resumeDays === 1 ? "" : "s"}`;
  }
  return "As tolerated";
}

export function DentalCertificateManager(props: {
  patientId: string | null;
  visitId?: string | null;
  initialRole: Role;
  patient?: Patient | null;
}) {
  const canWrite =
    props.initialRole === "ADMIN_I" ||
    props.initialRole === "ADMIN_II" ||
    props.initialRole === "USER";

  const [history, setHistory] = useState<CertificateSummary[]>([]);
  const [procedures, setProcedures] = useState<CertifiableProcedure[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [issuedAt, setIssuedAt] = useState(todayManilaYmd());
  const [purpose, setPurpose] = useState<CertificatePurpose>("FIT_TO_WORK");
  const [purposeDetail, setPurposeDetail] = useState("");
  const [resumeMode, setResumeMode] =
    useState<CertificateResumeMode>("AS_TOLERATED");
  const [resumeDate, setResumeDate] = useState(todayManilaYmd());
  const [resumeDays, setResumeDays] = useState("3");
  const [remarks, setRemarks] = useState("");
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    if (!props.patientId) {
      setHistory([]);
      setProcedures([]);
      return;
    }
    setLoading(true);
    const [historyRes, proceduresRes] = await Promise.all([
      api<{ certificates: CertificateSummary[] }>(
        `/api/dental-certificates?patientId=${encodeURIComponent(props.patientId)}`,
      ),
      api<{ procedures: CertifiableProcedure[] }>(
        `/api/patients/${props.patientId}/certifiable-procedures`,
      ),
    ]);
    setLoading(false);

    if (!historyRes.ok) {
      setErr(
        (historyRes.data as { error?: string }).error ??
          "Could not load certificates",
      );
      return;
    }
    if (!proceduresRes.ok) {
      setErr(
        (proceduresRes.data as { error?: string }).error ??
          "Could not load procedures",
      );
      return;
    }
    setErr(null);
    setHistory(historyRes.data.certificates);
    setProcedures(proceduresRes.data.procedures);
  }, [props.patientId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /** Procedures from the visit in context, so "this visit" is one click away. */
  const currentVisitLineIds = useMemo(
    () =>
      props.visitId
        ? procedures.filter((p) => p.visitId === props.visitId).map((p) => p.lineId)
        : [],
    [procedures, props.visitId],
  );

  function startNewCertificate() {
    setShowForm(true);
    setIssuedAt(todayManilaYmd());
    setPurpose("FIT_TO_WORK");
    setPurposeDetail("");
    setResumeMode("AS_TOLERATED");
    setResumeDate(todayManilaYmd());
    setResumeDays("3");
    setRemarks("");
    setSelectedLineIds(currentVisitLineIds);
    setSuccessMsg(null);
    setErr(null);
  }

  function toggleLine(lineId: string) {
    setSelectedLineIds((prev) =>
      prev.includes(lineId)
        ? prev.filter((id) => id !== lineId)
        : [...prev, lineId],
    );
  }

  async function saveCertificate() {
    if (!props.patientId) return;

    if (purpose === "OTHER" && !purposeDetail.trim()) {
      setErr("Describe what the certificate is for.");
      return;
    }
    if (resumeMode === "DATE" && !resumeDate) {
      setErr("Choose the date the patient may resume.");
      return;
    }
    const days = Number.parseInt(resumeDays, 10);
    if (resumeMode === "AFTER_DAYS" && (!Number.isFinite(days) || days < 1)) {
      setErr("Enter how many days of rest are advised.");
      return;
    }

    setSaving(true);
    setErr(null);
    const { ok, data } = await api<{
      certificate: CertificateSummary;
      error?: string;
    }>("/api/dental-certificates", {
      method: "POST",
      body: JSON.stringify({
        patientId: props.patientId,
        visitId: props.visitId ?? null,
        issuedAt,
        purpose,
        purposeDetail: purpose === "OTHER" ? purposeDetail.trim() : null,
        resumeMode,
        resumeDate: resumeMode === "DATE" ? resumeDate : null,
        resumeDays: resumeMode === "AFTER_DAYS" ? days : null,
        remarks: remarks.trim() || null,
        lineIds: selectedLineIds,
      }),
    });
    setSaving(false);

    if (!ok) {
      setErr(data.error ?? "Could not save certificate");
      return;
    }

    setShowForm(false);
    setSuccessMsg(
      `Dental certificate #${data.certificate.certificateNumber} saved.`,
    );
    await loadData();
    window.open(
      `/dental-certificates/${data.certificate.id}/print`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  if (!props.patientId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a patient to view or issue dental certificates.
      </p>
    );
  }

  const patientLabel = props.patient
    ? `${props.patient.lastName}, ${props.patient.firstName}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dental certificates</h1>
          {patientLabel ? (
            <p className="text-sm text-muted-foreground">
              Patient: {patientLabel}
            </p>
          ) : null}
        </div>
        {canWrite && !showForm ? (
          <Button type="button" onClick={startNewCertificate}>
            <Plus className="mr-2 h-4 w-4" />
            New certificate
          </Button>
        ) : null}
      </div>

      {err ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {err}
        </p>
      ) : null}
      {successMsg ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {successMsg}
        </p>
      ) : null}

      {showForm ? (
        <section className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">New dental certificate</h2>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cert-issued-at">Date issued</Label>
              <Input
                id="cert-issued-at"
                className="mt-1"
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cert-purpose">What is this certificate for?</Label>
              <select
                id="cert-purpose"
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={purpose}
                onChange={(e) =>
                  setPurpose(e.target.value as CertificatePurpose)
                }
              >
                {CERTIFICATE_PURPOSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {purpose === "OTHER" ? (
            <div className="mb-4">
              <Label htmlFor="cert-purpose-detail">Describe the purpose</Label>
              <Input
                id="cert-purpose-detail"
                className="mt-1"
                value={purposeDetail}
                onChange={(e) => setPurposeDetail(e.target.value)}
                placeholder="e.g. Fit to travel"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                This is printed in capitals on the certificate.
              </p>
            </div>
          ) : null}

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cert-resume-mode">
                When may the patient resume?
              </Label>
              <select
                id="cert-resume-mode"
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={resumeMode}
                onChange={(e) =>
                  setResumeMode(e.target.value as CertificateResumeMode)
                }
              >
                {CERTIFICATE_RESUME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {resumeMode === "DATE" ? (
              <div>
                <Label htmlFor="cert-resume-date">Resume on</Label>
                <Input
                  id="cert-resume-date"
                  className="mt-1"
                  type="date"
                  value={resumeDate}
                  onChange={(e) => setResumeDate(e.target.value)}
                />
              </div>
            ) : null}
            {resumeMode === "AFTER_DAYS" ? (
              <div>
                <Label htmlFor="cert-resume-days">Rest for (days)</Label>
                <Input
                  id="cert-resume-days"
                  className="mt-1"
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={resumeDays}
                  onChange={(e) => setResumeDays(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          <div className="mb-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Label>Procedures to certify</Label>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={procedures.length === 0}
                  onClick={() =>
                    setSelectedLineIds(procedures.map((p) => p.lineId))
                  }
                >
                  Select all
                </Button>
                {currentVisitLineIds.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedLineIds(currentVisitLineIds)}
                  >
                    This visit only
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectedLineIds([])}
                >
                  Clear
                </Button>
              </div>
            </div>

            {procedures.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                No recorded procedures yet. The certificate can still be issued
                without listing any.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {procedures.map((procedure) => (
                  <li key={procedure.lineId}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md p-2 hover:bg-muted/50">
                      <Checkbox
                        checked={selectedLineIds.includes(procedure.lineId)}
                        onCheckedChange={() => toggleLine(procedure.lineId)}
                        className="mt-0.5"
                      />
                      <span className="text-sm">
                        <span className="font-medium">{procedure.name}</span>
                        {procedure.detail ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({procedure.detail})
                          </span>
                        ) : null}
                        <span className="block text-xs text-muted-foreground">
                          {procedure.performedOn}
                          {procedure.visitId === props.visitId
                            ? " · this visit"
                            : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedLineIds.length} of {procedures.length} selected.
            </p>
          </div>

          <div className="mb-4">
            <Label htmlFor="cert-remarks">Remarks (optional)</Label>
            <Textarea
              id="cert-remarks"
              className="mt-1"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Advised soft diet and no strenuous activity."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void saveCertificate()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save & print"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-medium">
          <ScrollText className="h-5 w-5" />
          Certificate history
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No certificates issued for this patient yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Date issued</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Resume</TableHead>
                <TableHead>Procedures</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((cert) => (
                <TableRow key={cert.id}>
                  <TableCell>#{cert.certificateNumber}</TableCell>
                  <TableCell>{formatYmd(cert.issuedAt)}</TableCell>
                  <TableCell>
                    {certificatePurposeLabel(cert.purpose, cert.purposeDetail)}
                  </TableCell>
                  <TableCell>{resumeLabel(cert)}</TableCell>
                  <TableCell>{cert.lineCount}</TableCell>
                  <TableCell className="text-right">
                    <a
                      href={`/dental-certificates/${cert.id}/print`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
