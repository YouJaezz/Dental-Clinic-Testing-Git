import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { api } from "@/lib/api-client";
import type { Patient, Role } from "@/lib/clinical-types";
import {
  guessQuantityUnit,
  PRESCRIPTION_QUANTITY_UNITS,
  type MedicineCatalogItem,
  type PrescriptionSummary,
} from "@/lib/medicine-catalog-dto";
import { toManilaDateKey } from "@/lib/manila-date";

type DraftLine = {
  key: string;
  catalogId: string;
  doseStrength: string;
  quantity: string;
  quantityUnit: string;
  instructions: string;
};

function todayManilaYmd(): string {
  return toManilaDateKey(new Date());
}

function formatPrescribedDate(iso: string): string {
  try {
    return toManilaDateKey(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function PrescriptionManager(props: {
  patientId: string | null;
  visitId?: string | null;
  initialRole: Role;
  patient?: Patient | null;
}) {
  const canWrite =
    props.initialRole === "ADMIN_I" ||
    props.initialRole === "ADMIN_II" ||
    props.initialRole === "USER";

  const [catalog, setCatalog] = useState<MedicineCatalogItem[]>([]);
  const [history, setHistory] = useState<PrescriptionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [prescribedAt, setPrescribedAt] = useState(todayManilaYmd());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const catalogById = useMemo(
    () => new Map(catalog.map((item) => [item.id, item])),
    [catalog],
  );

  const loadData = useCallback(async () => {
    if (!props.patientId) {
      setHistory([]);
      return;
    }
    setLoading(true);
    setErr(null);
    const [catalogRes, historyRes] = await Promise.all([
      api<{ catalog: MedicineCatalogItem[] }>("/api/medicine-catalog"),
      api<{ prescriptions: PrescriptionSummary[] }>(
        `/api/prescriptions?patientId=${encodeURIComponent(props.patientId)}`,
      ),
    ]);
    setLoading(false);
    if (!catalogRes.ok) {
      setErr(
        (catalogRes.data as { error?: string }).error ??
          "Could not load medicine list",
      );
      return;
    }
    if (!historyRes.ok) {
      setErr(
        (historyRes.data as { error?: string }).error ??
          "Could not load prescriptions",
      );
      return;
    }
    setCatalog(catalogRes.data.catalog);
    setHistory(historyRes.data.prescriptions);
  }, [props.patientId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function startNewPrescription() {
    setShowForm(true);
    setPrescribedAt(todayManilaYmd());
    setNotes("");
    setLines([
      {
        key: crypto.randomUUID(),
        catalogId: catalog[0]?.id ?? "",
        doseStrength: catalog[0]?.defaultDose ?? "",
        quantity: "1",
        quantityUnit: guessQuantityUnit(catalog[0]?.defaultDose ?? null),
        instructions: catalog[0]?.defaultInstructions ?? "",
      },
    ]);
    setSuccessMsg(null);
    setErr(null);
  }

  function addLine() {
    const first = catalog[0];
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        catalogId: first?.id ?? "",
        doseStrength: first?.defaultDose ?? "",
        quantity: "1",
        quantityUnit: guessQuantityUnit(first?.defaultDose ?? null),
        instructions: first?.defaultInstructions ?? "",
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.catalogId && patch.catalogId !== line.catalogId) {
          const item = catalogById.get(patch.catalogId);
          if (item) {
            next.doseStrength = item.defaultDose ?? "";
            next.instructions = item.defaultInstructions ?? "";
            next.quantityUnit = guessQuantityUnit(item.defaultDose ?? null);
          }
        }
        return next;
      }),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  async function savePrescription() {
    if (!props.patientId) return;
    if (lines.length === 0) {
      setErr("Add at least one medicine.");
      return;
    }
    if (lines.some((line) => !line.catalogId)) {
      setErr("Select a medicine for each row.");
      return;
    }
    if (
      lines.some((line) => {
        const q = Number.parseInt(line.quantity, 10);
        return !Number.isFinite(q) || q < 1;
      })
    ) {
      setErr("Enter a valid quantity (at least 1) for each medicine.");
      return;
    }

    setSaving(true);
    setErr(null);
    const { ok, data } = await api<{ prescription: PrescriptionSummary }>(
      "/api/prescriptions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: props.patientId,
          visitId: props.visitId ?? null,
          prescribedAt,
          notes: notes.trim() || null,
          lines: lines.map((line) => ({
            catalogId: line.catalogId,
            doseStrength: line.doseStrength.trim() || null,
            instructions: line.instructions.trim() || null,
            quantity: Number.parseInt(line.quantity, 10),
            quantityUnit: line.quantityUnit.trim() || null,
          })),
        }),
      },
    );
    setSaving(false);

    if (!ok) {
      setErr((data as { error?: string }).error ?? "Could not save prescription");
      return;
    }

    setShowForm(false);
    setSuccessMsg(
      `Prescription #${data.prescription.prescriptionNumber} saved.`,
    );
    await loadData();
    window.open(
      `/prescriptions/${data.prescription.id}/print`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  if (!props.patientId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a patient to view or create prescriptions.
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
          <h1 className="text-xl font-semibold">Prescriptions</h1>
          {patientLabel ? (
            <p className="text-sm text-muted-foreground">Patient: {patientLabel}</p>
          ) : null}
        </div>
        {canWrite && !showForm ? (
          <Button type="button" onClick={startNewPrescription} disabled={catalog.length === 0}>
            <Plus className="mr-2 h-4 w-4" />
            New prescription
          </Button>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Medicines are chosen from a preset list. Need something else? Ask Admin I to add it under{" "}
        <a href="/admin" className="font-medium text-primary underline-offset-4 hover:underline">
          Administration → Medicine catalog
        </a>
        .
      </p>

      {err ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
          <h2 className="mb-4 text-lg font-medium">New prescription</h2>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="prescribed-at">Date given</Label>
              <Input
                id="prescribed-at"
                type="date"
                value={prescribedAt}
                onChange={(e) => setPrescribedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Medicines</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add row
              </Button>
            </div>
            {lines.map((line, index) => (
              <div
                key={line.key}
                className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-12"
              >
                <div className="sm:col-span-3">
                  <Label className="text-xs">Medicine</Label>
                  <select
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={line.catalogId}
                    onChange={(e) =>
                      updateLine(line.key, { catalogId: e.target.value })
                    }
                  >
                    <option value="">Select medicine…</option>
                    {catalog.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.code ? ` (${item.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <Label className="text-xs">Dose / strength</Label>
                  <Input
                    className="mt-1"
                    value={line.doseStrength}
                    onChange={(e) =>
                      updateLine(line.key, { doseStrength: e.target.value })
                    }
                    placeholder="e.g. 500 mg capsule"
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label className="text-xs">#</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min={1}
                    step={1}
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(line.key, { quantity: e.target.value })
                    }
                    placeholder="10"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Unit</Label>
                  <select
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={line.quantityUnit}
                    onChange={(e) =>
                      updateLine(line.key, { quantityUnit: e.target.value })
                    }
                  >
                    {PRESCRIPTION_QUANTITY_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Instructions (Sig.)</Label>
                  <Input
                    className="mt-1"
                    value={line.instructions}
                    onChange={(e) =>
                      updateLine(line.key, { instructions: e.target.value })
                    }
                    placeholder="e.g. 1 cap every 8 hours"
                  />
                </div>
                <div className="flex items-end sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove medicine row ${index + 1}`}
                    disabled={lines.length <= 1}
                    onClick={() => removeLine(line.key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <Label htmlFor="rx-notes">Notes / additional instructions</Label>
            <Textarea
              id="rx-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes for the printed pad"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void savePrescription()} disabled={saving}>
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
          <FileText className="h-5 w-5" />
          Prescription history
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No prescriptions recorded for this patient yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Date given</TableHead>
                <TableHead>Medicines</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((rx) => (
                <TableRow key={rx.id}>
                  <TableCell>#{rx.prescriptionNumber}</TableCell>
                  <TableCell>{formatPrescribedDate(rx.prescribedAt)}</TableCell>
                  <TableCell>{rx.lineCount}</TableCell>
                  <TableCell className="text-right">
                    <a
                      href={`/prescriptions/${rx.id}/print`}
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
