import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Images,
  LayoutDashboard,
  Loader2,
  Pencil,
  Printer,
  QrCode,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { PatientDuplicateDialog } from "@/components/PatientDuplicateDialog";
import type { PotentialDuplicate } from "@/lib/patient-duplicate-types";
import { PATIENT_LIST_DEFAULT_PAGE_SIZE } from "@/lib/patient-list-constants";
import type { PatientListRegistryFilter } from "@/lib/patient-list";
import {
  formatPatientRecordAge,
  patientRecordAgeTone,
} from "@/lib/patient-record-age";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  MEDICAL_HISTORY_OPTIONS,
  formatMedicalHistorySummary,
  parseMedicalHistoryStored,
} from "@/lib/medical-history";
import {
  getLocationSearch,
  parseWorkspaceQuery,
  replaceUrlQuery,
  workspaceQuery,
} from "@/lib/workspace-url";
import {
  computeAgeFromBirthMs,
  estimateManilaBirthYmdFromAge,
  parseManilaBirthDateYmdToUtcMs,
  validateBirthDateMs,
} from "@/lib/patient-age";
import {
  PATIENT_CIVIL_STATUSES,
  parseCanonicalPatientCivilStatus,
  type PatientCivilStatus,
} from "@/lib/patient-civil-status";
import {
  PATIENT_GENDERS,
  parseCanonicalPatientGender,
  type PatientGender,
} from "@/lib/patient-gender";

type GenderFormValue = "" | PatientGender;
type CivilStatusFormValue = "" | PatientCivilStatus;

function agePreviewFromDobYmd(ymd: string): string | null {
  const t = ymd.trim();
  if (!t) return null;
  const ms = parseManilaBirthDateYmdToUtcMs(t);
  if (ms == null) return null;
  if (validateBirthDateMs(ms)) return null;
  return String(computeAgeFromBirthMs(ms));
}

function MedicalHistoryCheckboxes(props: {
  idPrefix: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(id: string, checked: boolean) {
    if (checked) {
      const next = [...props.selected];
      if (!next.includes(id)) next.push(id);
      props.onChange(next);
    } else {
      props.onChange(props.selected.filter((x) => x !== id));
    }
  }

  return (
    <div className="space-y-2">
      <Label>Medical history</Label>
      <p className="text-xs text-muted-foreground">
        Check all that apply — common conditions to note before dental
        treatment.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {MEDICAL_HISTORY_OPTIONS.map((opt) => (
          <div key={opt.id} className="flex items-start gap-2">
            <Checkbox
              id={`${props.idPrefix}-${opt.id}`}
              checked={props.selected.includes(opt.id)}
              onCheckedChange={(v) => toggle(opt.id, v === true)}
              disabled={props.disabled}
              className="mt-0.5"
            />
            <label
              htmlFor={`${props.idPrefix}-${opt.id}`}
              className="cursor-pointer text-sm font-normal leading-snug text-foreground peer-disabled:cursor-not-allowed"
            >
              {opt.label}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenderRadios(props: {
  name: string;
  value: GenderFormValue;
  onChange: (v: GenderFormValue) => void;
  disabled?: boolean;
  legacyHint?: string | null;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed">
        Gender
      </span>
      {props.legacyHint ? (
        <p className="text-xs text-muted-foreground">
          Earlier value on file:{" "}
          <span className="font-medium text-foreground">{props.legacyHint}</span>.
          Choose Male or Female to replace it.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {PATIENT_GENDERS.map((g) => (
          <label
            key={g}
            className="flex cursor-pointer items-center gap-2 text-sm font-normal leading-none text-foreground"
          >
            <input
              type="radio"
              name={props.name}
              className="h-4 w-4 accent-primary"
              checked={props.value === g}
              onChange={() => props.onChange(g)}
              disabled={props.disabled}
            />
            {g}
          </label>
        ))}
        <label className="flex cursor-pointer items-center gap-2 text-sm font-normal leading-none text-muted-foreground">
          <input
            type="radio"
            name={props.name}
            className="h-4 w-4 accent-primary"
            checked={props.value === ""}
            onChange={() => props.onChange("")}
            disabled={props.disabled}
          />
          Prefer not to say
        </label>
      </div>
    </div>
  );
}

function CivilStatusSelect(props: {
  id: string;
  value: CivilStatusFormValue;
  onChange: (v: CivilStatusFormValue) => void;
  disabled?: boolean;
  legacyHint?: string | null;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={props.id}>Civil status</Label>
      {props.legacyHint ? (
        <p className="text-xs text-muted-foreground">
          Earlier value on file:{" "}
          <span className="font-medium text-foreground">{props.legacyHint}</span>.
          Choose an option below to replace it.
        </p>
      ) : null}
      <select
        id={props.id}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={props.value}
        onChange={(e) =>
          props.onChange(e.target.value as CivilStatusFormValue)
        }
        disabled={props.disabled}
      >
        <option value="">— Select —</option>
        {PATIENT_CIVIL_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PatientHub(props: { initialRole: Role }) {
  const role = props.initialRole;
  const canEdit =
    role === "ADMIN_I" || role === "ADMIN_II" || role === "USER";
  const canArchive = role === "ADMIN_I" || role === "ADMIN_II";

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PATIENT_LIST_DEFAULT_PAGE_SIZE);
  const [pageCount, setPageCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [addedTodayCount, setAddedTodayCount] = useState<number | null>(null);
  const [registryFilter, setRegistryFilter] =
    useState<PatientListRegistryFilter>("all");
  const [listLoading, setListLoading] = useState(false);
  const pageRef = useRef(page);
  pageRef.current = page;
  const loadSeqRef = useRef(0);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emptyNewPatient = () => ({
    firstName: "",
    lastName: "",
    contactNumber: "",
    dateOfBirth: "",
    gender: "" as GenderFormValue,
    civilStatus: "" as CivilStatusFormValue,
    address: "",
    medicalHistoryConditions: [] as string[],
    notes: "",
  });

  const [addOpen, setAddOpen] = useState(false);
  const [newPatient, setNewPatient] = useState(emptyNewPatient);

  function clearNewPatientForm() {
    setErr(null);
    setNewPatient(emptyNewPatient());
  }

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  /** yyyy-MM-dd from server when edit dialog opened — omit PATCH dob unless changed */
  const [editLoadedDateOfBirth, setEditLoadedDateOfBirth] = useState("");
  /** Raw gender from DB when edit opened — used only for legacy free-text hint */
  const [editLoadedGenderRaw, setEditLoadedGenderRaw] = useState<string | null>(
    null,
  );
  const [editLoadedCivilStatusRaw, setEditLoadedCivilStatusRaw] = useState<
    string | null
  >(null);
  const [editLegacyMedicalHistory, setEditLegacyMedicalHistory] = useState<
    string | null
  >(null);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    contactNumber: "",
    dateOfBirth: "",
    gender: "" as GenderFormValue,
    civilStatus: "" as CivilStatusFormValue,
    address: "",
    medicalHistoryConditions: [] as string[],
    notes: "",
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);

  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateSummary, setDuplicateSummary] = useState("");
  const [duplicateMatches, setDuplicateMatches] = useState<PotentialDuplicate[]>(
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const { patientId: p } = parseWorkspaceQuery(getLocationSearch());
    setPatientId(p);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
  }, [registryFilter]);

  const loadPatients = useCallback(
    async (opts?: { silent?: boolean; pageOverride?: number }) => {
      const seq = ++loadSeqRef.current;
      if (!opts?.silent) {
        setErr(null);
        setListLoading(true);
      }
      const q = new URLSearchParams();
      const activePage = opts?.pageOverride ?? pageRef.current;
      q.set("page", String(activePage));
      q.set("pageSize", String(pageSize));
      if (searchQuery) q.set("q", searchQuery);
      if (registryFilter !== "all") q.set("filter", registryFilter);
      const { ok, data } = await api<{
        patients: Patient[];
        totalCount: number;
        matchCount: number;
        listedCount: number;
        page: number;
        pageSize: number;
        pageCount: number;
        addedTodayCount: number;
      }>(`/api/patients?${q.toString()}`);
      if (seq !== loadSeqRef.current) return;
      if (!opts?.silent) setListLoading(false);
      if (!ok) {
        if (!opts?.silent) {
          setErr(
            (data as { error?: string }).error ?? "Failed to load patients",
          );
        }
        return;
      }
      if (
        data.pageCount > 0 &&
        activePage > data.pageCount &&
        !opts?.pageOverride
      ) {
        setPage(data.pageCount);
        return;
      }
      setPatients(data.patients);
      setTotalCount(data.totalCount);
      setAddedTodayCount(data.addedTodayCount);
      setMatchCount(data.matchCount);
      setPageCount(data.pageCount);
    },
    [searchQuery, pageSize, registryFilter],
  );

  useEffect(() => {
    void loadPatients();
  }, [loadPatients, page]);

  function runSearchNow() {
    setSearchInput((v) => v);
    const next = searchInput.trim();
    setSearchQuery(next);
    setPage(1);
  }

  function refreshPatients() {
    void loadPatients();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("clinicalhub:patient-updated"));
    }
  }

  const listTotal = searchQuery ? matchCount : (totalCount ?? 0);
  const rangeStart =
    listTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd =
    listTotal === 0 ? 0 : Math.min(page * pageSize, listTotal);

  function selectPatient(id: string) {
    setPatientId(id);
    setErr(null);
    replaceUrlQuery("/patients", id, null);
  }

  function openEdit(p: Patient) {
    setEditId(p.id);
    const mh = parseMedicalHistoryStored(p.medicalHistory);
    setEditLegacyMedicalHistory(mh.legacyFreeText);
    setEditLoadedDateOfBirth(p.dateOfBirth ?? "");
    setEditLoadedGenderRaw(p.gender ?? null);
    setEditLoadedCivilStatusRaw(p.civilStatus ?? null);
    setEditForm({
      firstName: p.firstName,
      lastName: p.lastName,
      contactNumber: p.contactNumber ?? "",
      dateOfBirth:
        p.dateOfBirth ??
        estimateManilaBirthYmdFromAge(p.age ?? Number.NaN) ??
        "",
      gender: parseCanonicalPatientGender(p.gender) ?? "",
      civilStatus: parseCanonicalPatientCivilStatus(p.civilStatus) ?? "",
      address: p.address ?? "",
      medicalHistoryConditions: [...mh.conditionIds],
      notes: p.notes ?? "",
    });
    setEditOpen(true);
    setErr(null);
  }

  function openDelete(p: Patient) {
    setDeleteTarget(p);
    setDeleteOpen(true);
    setErr(null);
  }

  function newPatientPayload(confirmNotDuplicate?: boolean) {
    return {
      firstName: newPatient.firstName,
      lastName: newPatient.lastName,
      contactNumber: newPatient.contactNumber || null,
      dateOfBirth: newPatient.dateOfBirth.trim() || null,
      gender:
        newPatient.gender === ""
          ? null
          : (newPatient.gender satisfies PatientGender),
      civilStatus:
        newPatient.civilStatus === ""
          ? null
          : (newPatient.civilStatus satisfies PatientCivilStatus),
      address: newPatient.address || null,
      medicalHistoryConditions: newPatient.medicalHistoryConditions,
      notes: newPatient.notes || null,
      ...(confirmNotDuplicate ? { confirmNotDuplicate: true as const } : {}),
    };
  }

  async function addPatientSubmit(opts?: { confirmNotDuplicate?: boolean }) {
    if (!canEdit) return;
    setBusy(true);
    setErr(null);
    const { ok, data, status } = await api<{
      patient: Patient;
      error?: string;
      code?: string;
      summary?: string;
      duplicates?: PotentialDuplicate[];
    }>("/api/patients", {
      method: "POST",
      body: JSON.stringify(newPatientPayload(opts?.confirmNotDuplicate)),
    });
    setBusy(false);
    if (!ok) {
      if (
        status === 409 &&
        (data as { code?: string }).code === "POTENTIAL_DUPLICATE" &&
        (data as { duplicates?: PotentialDuplicate[] }).duplicates?.length
      ) {
        setDuplicateSummary(
          (data as { summary?: string }).summary ??
            (data as { error?: string }).error ??
            "Possible duplicate patient",
        );
        setDuplicateMatches(
          (data as { duplicates?: PotentialDuplicate[] }).duplicates ?? [],
        );
        setDuplicateOpen(true);
        return;
      }
      setErr((data as { error?: string }).error ?? "Could not create patient");
      return;
    }
    setDuplicateOpen(false);
    setDuplicateMatches([]);
    setAddOpen(false);
    setNewPatient(emptyNewPatient());
    await loadPatients();
    selectPatient(data.patient.id);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("clinicalhub:patient-updated", {
          detail: { patientId: data.patient.id },
        }),
      );
    }
  }

  function useExistingFromDuplicate(p: Patient) {
    setDuplicateOpen(false);
    setDuplicateMatches([]);
    setAddOpen(false);
    setNewPatient(emptyNewPatient());
    selectPatient(p.id);
  }

  async function editPatientSubmit() {
    if (!canEdit || !editId) return;
    setBusy(true);
    setErr(null);
    const dobTrimmed = editForm.dateOfBirth.trim();
    const loadedTrim = editLoadedDateOfBirth.trim();
    let dateOfBirthPatch: string | null | undefined;
    if (dobTrimmed === loadedTrim) {
      dateOfBirthPatch = undefined;
    } else {
      dateOfBirthPatch = dobTrimmed === "" ? null : dobTrimmed;
    }
    const { ok, data } = await api<{ patient: Patient; error?: string }>(
      `/api/patients/${editId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          contactNumber: editForm.contactNumber || null,
          ...(dateOfBirthPatch !== undefined
            ? { dateOfBirth: dateOfBirthPatch }
            : {}),
          gender:
            editForm.gender === "" ? null : (editForm.gender satisfies PatientGender),
          civilStatus:
            editForm.civilStatus === ""
              ? null
              : (editForm.civilStatus satisfies PatientCivilStatus),
          address: editForm.address || null,
          medicalHistoryConditions: editForm.medicalHistoryConditions,
          notes: editForm.notes || null,
        }),
      },
    );
    setBusy(false);
    if (!ok) {
      setErr((data as { error?: string }).error ?? "Could not update patient");
      return;
    }
    setEditOpen(false);
    setEditId(null);
    setEditLegacyMedicalHistory(null);
    setEditLoadedDateOfBirth("");
    setEditLoadedGenderRaw(null);
    setEditLoadedCivilStatusRaw(null);
    await loadPatients();
    if (patientId === editId) {
      replaceUrlQuery("/patients", data.patient.id, null);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("clinicalhub:patient-updated", {
          detail: { patientId: data.patient.id },
        }),
      );
    }
  }

  async function confirmArchive() {
    if (!canArchive || !deleteTarget) return;
    setBusy(true);
    setErr(null);
    const id = deleteTarget.id;
    const { ok, data } = await api<{ error?: string }>(
      `/api/patients/${id}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!ok) {
      setErr((data as { error?: string }).error ?? "Could not archive patient");
      return;
    }
    setDeleteOpen(false);
    setDeleteTarget(null);
    if (patientId === id) {
      setPatientId(null);
      replaceUrlQuery("/patients", null, null);
    }
    await loadPatients();
  }

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] max-h-[calc(100dvh-7.5rem)] min-h-[20rem] flex-col gap-3">
      {err ? (
        <p className="shrink-0 text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        {totalCount != null ? (
          <p className="shrink-0 text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {totalCount.toLocaleString()}
            </span>{" "}
            {totalCount === 1 ? "patient" : "patients"} registered
            {addedTodayCount != null ? (
              <>
                {" "}
                ·{" "}
                <span
                  className={
                    addedTodayCount > 0
                      ? "font-semibold tabular-nums text-primary"
                      : "font-medium tabular-nums text-foreground"
                  }
                >
                  {addedTodayCount.toLocaleString()}
                </span>{" "}
                new today
              </>
            ) : null}
            {searchQuery ? (
              <>
                {" "}
                ·{" "}
                <span className="font-medium text-foreground">
                  {matchCount.toLocaleString()}
                </span>{" "}
                match{matchCount === 1 ? "" : "es"}
              </>
            ) : null}
            {listTotal > 0 ? (
              <>
                {" "}
                · showing{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
                </span>{" "}
                of {listTotal.toLocaleString()}
              </>
            ) : null}
          </p>
        ) : null}
        <div
          className="flex shrink-0 flex-wrap gap-2 border-b border-border/60 pb-2"
          role="tablist"
          aria-label="Patient list filters"
        >
          {(
            [
              { id: "all" as const, label: "All patients" },
              { id: "new_today" as const, label: "New today" },
              { id: "recent_7d" as const, label: "Last 7 days" },
            ] as const
          ).map((tab) => (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={registryFilter === tab.id ? "default" : "secondary"}
              role="tab"
              aria-selected={registryFilter === tab.id}
              onClick={() => setRegistryFilter(tab.id)}
            >
              {tab.label}
              {tab.id === "new_today" && addedTodayCount != null ? (
                <span className="ml-1.5 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                  {addedTodayCount}
                </span>
              ) : null}
            </Button>
          ))}
        </div>
        <div className="flex shrink-0 flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1 sm:max-w-md">
            <Label htmlFor="search">Search patients</Label>
            <Input
              id="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearchNow();
                }
              }}
              placeholder="Name, contact #, address, history…"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => runSearchNow()}
            disabled={listLoading}
          >
            Search
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => refreshPatients()}
            disabled={listLoading}
            aria-label="Refresh patient list"
            title="Reload the current page of patients and update counts"
          >
            <RefreshCw
              className={cn("mr-1.5 h-4 w-4", listLoading && "animate-spin")}
              aria-hidden
            />
            Refresh
          </Button>
          <Button
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={!canEdit}
          >
            Add patient
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href="/patients/intake-qr">
              <QrCode className="mr-1.5 inline h-4 w-4" aria-hidden />
              Registration QR
            </a>
          </Button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-card">
          {listLoading ? (
            <div
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/40"
              aria-hidden
            >
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          <div className="h-full overflow-y-auto overscroll-contain">
            <Table containerClassName="overflow-visible">
              <TableHeader className="sticky top-0 z-10 bg-card shadow-sm [&_tr]:border-b">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Medical / notes</TableHead>
                <TableHead className="w-[1%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow
                  key={p.id}
                  data-state={p.id === patientId ? "selected" : undefined}
                  className={p.id === patientId ? "bg-muted" : "cursor-pointer"}
                  onClick={() => selectPatient(p.id)}
                >
                  <TableCell>
                    {p.lastName}, {p.firstName}
                  </TableCell>
                  <TableCell>
                    {p.createdAt ? (
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium leading-snug",
                          patientRecordAgeTone(p.createdAt) === "new" &&
                            "bg-primary/15 text-primary",
                          patientRecordAgeTone(p.createdAt) === "recent" &&
                            "bg-highlight/40 text-foreground",
                          patientRecordAgeTone(p.createdAt) === "older" &&
                            "bg-muted text-muted-foreground",
                        )}
                        title={new Date(p.createdAt).toLocaleString("en-PH", {
                          timeZone: "Asia/Manila",
                        })}
                      >
                        {formatPatientRecordAge(p.createdAt)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{p.age ?? "—"}</TableCell>
                  <TableCell className="max-w-[10rem] truncate">
                    {p.contactNumber ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {(() => {
                      const mh = formatMedicalHistorySummary(
                        p.medicalHistory,
                      );
                      if (mh !== "—") return mh;
                      return p.notes ?? "—";
                    })()}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        asChild
                        aria-label="Open visit workspace"
                        title="Open visit workspace"
                      >
                        <a href={`/workspace${workspaceQuery(p.id, null)}`}>
                          <LayoutDashboard />
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        asChild
                        aria-label="Open patient files"
                        title="X-rays, photos and scanned documents"
                      >
                        <a
                          href={`/workspace/documents${workspaceQuery(p.id, null)}`}
                        >
                          <Images />
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        asChild
                        aria-label="Print or download patient history PDF"
                        title="Print or download PDF — choose full history or a visit date"
                      >
                        <a
                          href={`/patients/${p.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Printer />
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={!canEdit}
                        aria-label="Edit patient"
                        title="Edit patient"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil />
                      </Button>
                      {canArchive ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Archive patient"
                          title="Archive patient"
                          onClick={() => openDelete(p)}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {patients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    {searchQuery
                      ? "No patients match your search."
                      : registryFilter === "new_today"
                        ? "No new patients registered today."
                        : registryFilter === "recent_7d"
                          ? "No patients added in the last 7 days."
                          : "No patients yet."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Label htmlFor="page-size" className="sr-only">
              Rows per page
            </Label>
            <span className="text-xs">Per page</span>
            <select
              id="page-size"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || listLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Prev
            </Button>
            <span className="min-w-[6rem] text-center text-sm tabular-nums text-muted-foreground">
              {pageCount === 0 ? "—" : `Page ${page} / ${pageCount}`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pageCount || pageCount === 0 || listLoading}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </section>

      <PatientDuplicateDialog
        open={duplicateOpen}
        summary={duplicateSummary}
        duplicates={duplicateMatches}
        busy={busy}
        onOpenChange={setDuplicateOpen}
        onUseExisting={useExistingFromDuplicate}
        onCreateAnyway={() => void addPatientSubmit({ confirmNotDuplicate: true })}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add patient</DialogTitle>
            <DialogDescription>
              Create a new patient record. Enter date of birth when possible — we
              check for existing patients with the same name and birthday before
              saving.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
            <div className="grid gap-1 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="fn">First name</Label>
                <Input
                  id="fn"
                  value={newPatient.firstName}
                  onChange={(e) =>
                    setNewPatient((s) => ({ ...s, firstName: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="ln">Last name</Label>
                <Input
                  id="ln"
                  value={newPatient.lastName}
                  onChange={(e) =>
                    setNewPatient((s) => ({ ...s, lastName: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={newPatient.dateOfBirth}
                  onChange={(e) =>
                    setNewPatient((s) => ({
                      ...s,
                      dateOfBirth: e.target.value,
                    }))
                  }
                />
                {agePreviewFromDobYmd(newPatient.dateOfBirth) != null ? (
                  <p className="text-xs text-muted-foreground">
                    Age (from DOB): {agePreviewFromDobYmd(newPatient.dateOfBirth)}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1">
                <GenderRadios
                  name="new-gender"
                  value={newPatient.gender}
                  onChange={(v) =>
                    setNewPatient((s) => ({ ...s, gender: v }))
                  }
                  disabled={!canEdit}
                />
              </div>
            </div>
            <CivilStatusSelect
              id="new-civil"
              value={newPatient.civilStatus}
              onChange={(v) =>
                setNewPatient((s) => ({ ...s, civilStatus: v }))
              }
              disabled={!canEdit}
            />
            <div className="grid gap-1">
              <Label htmlFor="addr">Address</Label>
              <Textarea
                id="addr"
                value={newPatient.address}
                onChange={(e) =>
                  setNewPatient((s) => ({ ...s, address: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cn">Contact #</Label>
              <Input
                id="cn"
                value={newPatient.contactNumber}
                onChange={(e) =>
                  setNewPatient((s) => ({
                    ...s,
                    contactNumber: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-1">
              <MedicalHistoryCheckboxes
                idPrefix="new-mh"
                selected={newPatient.medicalHistoryConditions}
                onChange={(ids) =>
                  setNewPatient((s) => ({
                    ...s,
                    medicalHistoryConditions: ids,
                  }))
                }
                disabled={!canEdit}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="no">Other notes</Label>
              <Textarea
                id="no"
                value={newPatient.notes}
                onChange={(e) =>
                  setNewPatient((s) => ({ ...s, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={clearNewPatientForm}
            >
              Clear
            </Button>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void addPatientSubmit()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditId(null);
            setEditLoadedDateOfBirth("");
            setEditLoadedGenderRaw(null);
            setEditLoadedCivilStatusRaw(null);
            setEditLegacyMedicalHistory(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit patient</DialogTitle>
            <DialogDescription>Update this patient&apos;s details.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
            {editLegacyMedicalHistory ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-medium">Earlier typed medical note (read-only)</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {editLegacyMedicalHistory}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Saving replaces this typed note with your checkbox selections
                  only. Copy anything you need to keep into <strong>Other notes</strong>{" "}
                  before saving.
                </p>
              </div>
            ) : null}
            <div className="grid gap-1 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="efn">First name</Label>
                <Input
                  id="efn"
                  value={editForm.firstName}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, firstName: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="eln">Last name</Label>
                <Input
                  id="eln"
                  value={editForm.lastName}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, lastName: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="edob">Date of birth</Label>
                <Input
                  id="edob"
                  type="date"
                  value={editForm.dateOfBirth}
                  onChange={(e) =>
                    setEditForm((s) => ({
                      ...s,
                      dateOfBirth: e.target.value,
                    }))
                  }
                />
                {agePreviewFromDobYmd(editForm.dateOfBirth) != null ? (
                  <p className="text-xs text-muted-foreground">
                    Age (from DOB):{" "}
                    {agePreviewFromDobYmd(editForm.dateOfBirth)}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1">
                <GenderRadios
                  name="edit-gender"
                  value={editForm.gender}
                  onChange={(v) =>
                    setEditForm((s) => ({ ...s, gender: v }))
                  }
                  disabled={!canEdit}
                  legacyHint={
                    editLoadedGenderRaw?.trim() &&
                    !parseCanonicalPatientGender(editLoadedGenderRaw)
                      ? editLoadedGenderRaw.trim()
                      : null
                  }
                />
              </div>
            </div>
            <CivilStatusSelect
              id="edit-civil"
              value={editForm.civilStatus}
              onChange={(v) =>
                setEditForm((s) => ({ ...s, civilStatus: v }))
              }
              disabled={!canEdit}
              legacyHint={
                editLoadedCivilStatusRaw?.trim() &&
                !parseCanonicalPatientCivilStatus(editLoadedCivilStatusRaw)
                  ? editLoadedCivilStatusRaw.trim()
                  : null
              }
            />
            <div className="grid gap-1">
              <Label htmlFor="eaddr">Address</Label>
              <Textarea
                id="eaddr"
                value={editForm.address}
                onChange={(e) =>
                  setEditForm((s) => ({ ...s, address: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="ecn">Contact #</Label>
              <Input
                id="ecn"
                value={editForm.contactNumber}
                onChange={(e) =>
                  setEditForm((s) => ({
                    ...s,
                    contactNumber: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-1">
              <MedicalHistoryCheckboxes
                idPrefix="edit-mh"
                selected={editForm.medicalHistoryConditions}
                onChange={(ids) =>
                  setEditForm((s) => ({
                    ...s,
                    medicalHistoryConditions: ids,
                  }))
                }
                disabled={!canEdit}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="eno">Other notes</Label>
              <Textarea
                id="eno"
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm((s) => ({ ...s, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void editPatientSubmit()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive patient</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `This will archive ${deleteTarget.lastName}, ${deleteTarget.firstName}. Visits and billing history stay in the database; the patient will no longer appear in this list.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmArchive()}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
