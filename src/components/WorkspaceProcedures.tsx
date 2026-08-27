import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag, Plus, Trash2 } from "lucide-react";
import type { ProcedureVoidCategory } from "@/db/schema.shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { CatalogItem, Role } from "@/lib/clinical-types";
import { formatCents, pesoStringToCents } from "@/lib/money";
import { useWorkspaceContext } from "@/lib/use-workspace-context";
import { workspaceQuery } from "@/lib/workspace-url";
import { catalogRequiresQuantity } from "@/lib/procedure-pricing";
import { TOOTH_MAX, TOOTH_MIN, normalizeToothNumbers } from "@/lib/teeth";

type ProcedureLineRow = {
  id: string;
  visitId: string;
  catalogId: string;
  quantity: number;
  unitPriceCentsSnapshot: number;
  lineTotalCents: number;
  procedureLevelLabelSnapshot: string | null;
  toothNumbers: number[] | null;
  lineNotes: string | null;
  createdAt: string;
  catalogName: string;
  catalogCode: string | null;
};

function pricingLabel(mode: CatalogItem["pricingMode"]): string {
  if (mode === "MANUAL") return "Manual";
  if (mode === "BY_LEVEL") return "By level";
  if (mode === "PER_UNIT") return "Per unit";
  return "Fixed";
}

export function WorkspaceProcedures(props: { initialRole: Role }) {
  const isAdmin =
    props.initialRole === "ADMIN_I" || props.initialRole === "ADMIN_II";
  const canWrite =
    props.initialRole === "ADMIN_I" ||
    props.initialRole === "ADMIN_II" ||
    props.initialRole === "USER";
  const canRequestCorrection =
    props.initialRole === "USER" || props.initialRole === "TRAINEE";
  const { patientId, visitId, resolving } = useWorkspaceContext();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lines, setLines] = useState<ProcedureLineRow[]>([]);
  const [levelIdByCatalogId, setLevelIdByCatalogId] = useState<
    Record<string, string>
  >({});
  const [manualPesoByCatalogId, setManualPesoByCatalogId] = useState<
    Record<string, string>
  >({});
  const [lineNotesDraftByCatalogId, setLineNotesDraftByCatalogId] = useState<
    Record<string, string>
  >({});
  /** Draft tooth number strings per manual catalog row (add row for multiple). */
  const [manualToothDraftsByCatalogId, setManualToothDraftsByCatalogId] =
    useState<Record<string, string[]>>({});
  const [quantityByCatalogId, setQuantityByCatalogId] = useState<
    Record<string, string>
  >({});
  const [submittingCatalogId, setSubmittingCatalogId] = useState<string | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [visitStatus, setVisitStatus] = useState<"OPEN" | "CLOSED" | null>(
    null,
  );
  const [pendingRequestLineIds, setPendingRequestLineIds] = useState<string[]>(
    [],
  );
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionLineId, setCorrectionLineId] = useState<string | null>(null);
  const [correctionMode, setCorrectionMode] = useState<"request" | "admin-void">(
    "request",
  );
  const [voidCategory, setVoidCategory] = useState<ProcedureVoidCategory>("ERROR");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionBusy, setCorrectionBusy] = useState(false);

  const loadCatalogAndLines = useCallback(
    async (resetDrafts: boolean) => {
      if (!visitId) return;
      const { ok, data } = await api<{
        catalog: CatalogItem[];
        lines: ProcedureLineRow[];
        visitStatus: "OPEN" | "CLOSED";
        pendingRequestLineIds: string[];
      }>(`/api/visits/${visitId}/procedures`);
      if (!ok) {
        const msg = (data as { error?: string }).error;
        if (resetDrafts) {
          setErr(msg ?? "Could not load procedures");
        }
        return;
      }
      setErr(null);
      setCatalog(data.catalog);
      setLines(data.lines);
      setVisitStatus(data.visitStatus);
      setPendingRequestLineIds(data.pendingRequestLineIds ?? []);
      if (resetDrafts) {
        const nextManual: Record<string, string> = {};
        const nextTeeth: Record<string, string[]> = {};
        const nextLevel: Record<string, string> = {};
        const nextNotes: Record<string, string> = {};
        for (const c of data.catalog) {
          nextManual[c.id] = "";
          nextTeeth[c.id] = [""];
          nextLevel[c.id] = c.levelPrices[0]?.id ?? "";
          nextNotes[c.id] = "";
        }
        setManualPesoByCatalogId(nextManual);
        setManualToothDraftsByCatalogId(nextTeeth);
        setLevelIdByCatalogId(nextLevel);
        setLineNotesDraftByCatalogId(nextNotes);
      } else {
        setManualPesoByCatalogId((prev) => {
          const next = { ...prev };
          for (const c of data.catalog) {
            if (next[c.id] === undefined) next[c.id] = "";
          }
          return next;
        });
        setManualToothDraftsByCatalogId((prev) => {
          const next = { ...prev };
          for (const c of data.catalog) {
            if (next[c.id] === undefined) next[c.id] = [""];
          }
          return next;
        });
        setLevelIdByCatalogId((prev) => {
          const next = { ...prev };
          for (const c of data.catalog) {
            if (next[c.id] === undefined || next[c.id] === "") {
              next[c.id] = c.levelPrices[0]?.id ?? "";
            }
          }
          return next;
        });
        setLineNotesDraftByCatalogId((prev) => {
          const next = { ...prev };
          for (const c of data.catalog) {
            if (next[c.id] === undefined) next[c.id] = "";
          }
          return next;
        });
      }
    },
    [visitId],
  );

  useEffect(() => {
    if (!visitId) {
      setCatalog([]);
      setLines([]);
      setVisitStatus(null);
      setPendingRequestLineIds([]);
      setManualPesoByCatalogId({});
      setManualToothDraftsByCatalogId({});
      setLevelIdByCatalogId({});
      setLineNotesDraftByCatalogId({});
      setSaveMsg(null);
      return;
    }
    setSaveMsg(null);
    void loadCatalogAndLines(true).catch(() => {});
  }, [visitId, loadCatalogAndLines]);

  useEffect(() => {
    if (!visitId) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadCatalogAndLines(false).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [visitId, loadCatalogAndLines]);

  async function submitCatalogRow(c: CatalogItem) {
    if (!visitId || !canWrite) return;

    const notesRaw = lineNotesDraftByCatalogId[c.id] ?? "";
    const notes = notesRaw.trim() === "" ? null : notesRaw.trim();

    const postLine: {
      catalogId: string;
      quantity?: number;
      manualUnitPriceCents?: number;
      toothNumbers?: number[];
      procedureLevelId?: string;
      notes?: string | null;
    } = {
      catalogId: c.id,
      notes,
    };

    if (c.pricingMode === "MANUAL") {
      const drafts = manualToothDraftsByCatalogId[c.id] ?? [""];
      const { numbers, error: toothErr } = normalizeToothNumbers(drafts);
      if (toothErr) {
        setErr(`${c.name}: ${toothErr}`);
        return;
      }
      if (numbers.length === 0) {
        setErr(`Add at least one tooth number for "${c.name}".`);
        return;
      }
      const cents = pesoStringToCents(manualPesoByCatalogId[c.id] ?? "");
      if (cents === null) {
        setErr(
          `Enter a valid line price (PHP) for "${c.name}" (manual pricing).`,
        );
        return;
      }
      postLine.manualUnitPriceCents = cents;
      postLine.toothNumbers = numbers;
    } else if (c.pricingMode === "BY_LEVEL") {
      const tierId = levelIdByCatalogId[c.id] ?? "";
      if (!tierId) {
        setErr(`Choose a procedure level for "${c.name}".`);
        return;
      }
      postLine.quantity = 1;
      postLine.procedureLevelId = tierId;
    } else if (catalogRequiresQuantity(c.pricingMode)) {
      const raw = (quantityByCatalogId[c.id] ?? "1").trim();
      const q = Number.parseInt(raw, 10);
      if (!Number.isFinite(q) || q < 1) {
        setErr(`Enter a valid quantity (at least 1) for "${c.name}".`);
        return;
      }
      postLine.quantity = q;
    } else {
      postLine.quantity = 1;
    }

    setSubmittingCatalogId(c.id);
    setErr(null);
    setSaveMsg(null);
    const { ok, data } = await api<{ lines: unknown[] }>(
      `/api/visits/${visitId}/procedures`,
      { method: "POST", body: JSON.stringify({ lines: [postLine] }) },
    );
    setSubmittingCatalogId(null);
    if (!ok) {
      setErr(
        (data as { error?: string }).error ?? "Could not save procedure",
      );
      return;
    }

    setLineNotesDraftByCatalogId((m) => ({ ...m, [c.id]: "" }));
    if (c.pricingMode === "MANUAL") {
      setManualPesoByCatalogId((m) => ({ ...m, [c.id]: "" }));
      setManualToothDraftsByCatalogId((m) => ({ ...m, [c.id]: [""] }));
    }
    if (catalogRequiresQuantity(c.pricingMode)) {
      setQuantityByCatalogId((m) => ({ ...m, [c.id]: "1" }));
    }
    setSaveMsg(`Saved: ${c.name}`);
    await loadCatalogAndLines(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("clinicalhub:query"));
    }
  }

  function openRequestDialog(lineId: string) {
    setCorrectionLineId(lineId);
    setCorrectionMode("request");
    setCorrectionReason("");
    setCorrectionOpen(true);
  }

  function openAdminVoidDialog(lineId: string) {
    setCorrectionLineId(lineId);
    setCorrectionMode("admin-void");
    setVoidCategory("ERROR");
    setCorrectionReason("");
    setCorrectionOpen(true);
  }

  async function submitCorrection() {
    if (!visitId || !correctionLineId) return;
    setCorrectionBusy(true);
    setErr(null);

    if (correctionMode === "request") {
      const reason = correctionReason.trim();
      if (reason.length < 8) {
        setErr("Please enter a reason (at least 8 characters).");
        setCorrectionBusy(false);
        return;
      }
      const res = await api<{ error?: string }>("/api/correction-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId,
          lineId: correctionLineId,
          reason,
        }),
      });
      setCorrectionBusy(false);
      if (!res.ok) {
        setErr(res.data.error ?? "Request failed");
        return;
      }
      setCorrectionOpen(false);
      setSaveMsg("Request sent to administrator for review.");
    } else {
      const res = await api<{ error?: string }>(
        `/api/visits/${visitId}/procedures/${correctionLineId}/void`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: voidCategory,
            reason: correctionReason.trim() || undefined,
          }),
        },
      );
      setCorrectionBusy(false);
      if (!res.ok) {
        setErr(res.data.error ?? "Could not remove procedure line");
        return;
      }
      setCorrectionOpen(false);
      setSaveMsg(
        `Procedure marked (${voidCategory === "REFUNDED" ? "refunded" : "error"}). Totals updated; payments unchanged.`,
      );
    }

    await loadCatalogAndLines(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("clinicalhub:query"));
      window.dispatchEvent(new CustomEvent("clinicalhub:correction-requests"));
    }
  }

  async function removeProcedureLine(lineId: string) {
    if (!visitId || !canWrite) return;
    if (!window.confirm("Remove this procedure line from the visit?")) return;
    setRemovingId(lineId);
    setErr(null);
    setSaveMsg(null);
    const { ok, data } = await api<{ error?: string }>(
      `/api/visits/${visitId}/procedures/${lineId}`,
      { method: "DELETE" },
    );
    setRemovingId(null);
    if (!ok) {
      setErr(data.error ?? "Could not remove procedure line");
      return;
    }
    await loadCatalogAndLines(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("clinicalhub:query"));
    }
  }

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) => {
      const name = c.name.toLowerCase();
      const code = (c.code ?? "").toLowerCase();
      const mode = pricingLabel(c.pricingMode).toLowerCase();
      return name.includes(q) || code.includes(q) || mode.includes(q);
    });
  }, [catalog, catalogSearch]);

  if (resolving) {
    return (
      <p className="text-sm text-muted-foreground">Loading visit context…</p>
    );
  }

  if (!patientId || !visitId) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p className="mb-4">
          {patientId
            ? "No visit found for this patient. Start a visit on Overview first."
            : "Select a patient from the patient list or Workspace overview."}
        </p>
        <Button asChild variant="secondary">
          <a
            href={
              patientId
                ? `/workspace${workspaceQuery(patientId, visitId)}`
                : "/patients"
            }
          >
            {patientId ? "Go to overview" : "Choose a patient"}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {correctionMode === "admin-void"
                ? "Remove procedure (closed visit)"
                : "Request procedure removal"}
            </DialogTitle>
            <DialogDescription>
              {correctionMode === "admin-void"
                ? "Removes this charge from balances. Cash collected is unchanged. Printed records show (error) or (refunded)."
                : "An administrator will review your request."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {correctionMode === "admin-void" ? (
              <div className="space-y-2">
                <Label>Category</Label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="void-category"
                      checked={voidCategory === "ERROR"}
                      onChange={() => setVoidCategory("ERROR")}
                    />
                    Error (mistaken entry)
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="void-category"
                      checked={voidCategory === "REFUNDED"}
                      onChange={() => setVoidCategory("REFUNDED")}
                    />
                    Refunded
                  </label>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="correction-reason">
                {correctionMode === "admin-void"
                  ? "Note (optional)"
                  : "Reason (required)"}
              </Label>
              <Textarea
                id="correction-reason"
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder={
                  correctionMode === "admin-void"
                    ? "Optional details for audit / printed record…"
                    : "Explain why this line should be removed…"
                }
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCorrectionOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={correctionBusy}
              onClick={() => void submitCorrection()}
            >
              {correctionMode === "admin-void" ? "Remove line" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {visitStatus === "CLOSED" ? (
        <p className="rounded-md border border-highlight/60 bg-highlight/30 px-3 py-2 text-sm text-muted-foreground">
          This visit is closed. Remove mistaken lines via{" "}
          {isAdmin
            ? "the trash icon (choose error or refunded)"
            : "Request removal"}{" "}
          — cash collected is not reversed.
        </p>
      ) : null}

      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}
      {saveMsg ? (
        <p className="text-sm text-muted-foreground" role="status">
          {saveMsg}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recorded on this visit</h2>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No procedure lines yet. Add on the right — each procedure has its
              own Submit.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Procedure</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Teeth</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((row) => {
                  const teeth = row.toothNumbers;
                  const hasTeeth = teeth && teeth.length > 0;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.catalogName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.catalogCode ?? "—"}
                          {row.procedureLevelLabelSnapshot ? (
                            <span className="block text-foreground/80">
                              Level: {row.procedureLevelLabelSnapshot}
                            </span>
                          ) : null}
                        </div>
                        {row.lineNotes ? (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                            Notes: {row.lineNotes}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasTeeth ? "—" : row.quantity}
                      </TableCell>
                      <TableCell className="max-w-[10rem] text-right text-sm">
                        {hasTeeth ? teeth.join(", ") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(row.lineTotalCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {visitStatus === "OPEN" && (canWrite || isAdmin) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={removingId === row.id}
                            aria-label="Remove procedure line"
                            title="Remove procedure line"
                            onClick={() => void removeProcedureLine(row.id)}
                          >
                            <Trash2 />
                          </Button>
                        ) : visitStatus === "CLOSED" &&
                          pendingRequestLineIds.includes(row.id) ? (
                          <span className="text-xs font-medium text-amber-800">
                            Pending review
                          </span>
                        ) : visitStatus === "CLOSED" && isAdmin ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Remove procedure (error/refunded)"
                            title="Remove line (error or refunded)"
                            onClick={() => openAdminVoidDialog(row.id)}
                          >
                            <Trash2 />
                          </Button>
                        ) : visitStatus === "CLOSED" && canRequestCorrection ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => openRequestDialog(row.id)}
                          >
                            <Flag className="h-3 w-3" aria-hidden />
                            Request removal
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
        <section className="space-y-3">
          {visitStatus === "CLOSED" ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Visit is closed — new procedures cannot be added.
            </p>
          ) : (
            <>
          <h2 className="text-lg font-semibold">Add procedures</h2>
          <p className="text-sm text-muted-foreground">
            Fill in one procedure, add <strong>case notes</strong> if needed,
            then press <strong>Submit</strong> on that card.{" "}
            <strong>Per unit</strong> items (e.g. zirconia) need a quantity —
            total is price per unit × qty. Fixed and by-level record one line per
            submit. Manual: tooth numbers ({TOOTH_MIN}–{TOOTH_MAX}), line price
            in PHP, then Submit.
          </p>
          <div className="sticky top-0 z-10 space-y-2 rounded-lg border bg-background p-3 shadow-sm">
            <Label htmlFor="procedure-search">Search procedures</Label>
            <Input
              id="procedure-search"
              placeholder="Name, code, or pricing type…"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
            />
            {catalogSearch.trim() ? (
              <p className="text-xs text-muted-foreground">
                {filteredCatalog.length} of {catalog.length} shown
              </p>
            ) : null}
          </div>
          <div className="flex max-h-[min(70vh,40rem)] flex-col gap-3 overflow-y-auto pr-1">
            {filteredCatalog.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No procedures match &ldquo;{catalogSearch.trim()}&rdquo;. Try a
                different search or clear the field.
              </p>
            ) : null}
            {filteredCatalog.map((c) => (
              <div
                key={c.id}
                className="space-y-2 rounded-lg border bg-card p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.code ?? "—"}{" "}
                      <span className="rounded bg-muted px-1 py-0.5">
                        {pricingLabel(c.pricingMode)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {c.pricingMode === "MANUAL" ? (
                      "Manual pricing"
                    ) : c.pricingMode === "BY_LEVEL" ? (
                      <span>
                        {c.levelPrices.map((t) => (
                          <span key={t.id} className="block">
                            {t.label}: {formatCents(t.unitPriceCents)}
                          </span>
                        ))}
                      </span>
                    ) : c.pricingMode === "PER_UNIT" ? (
                      <>Per unit: {formatCents(c.unitPriceCents)}</>
                    ) : (
                      <>Fixed: {formatCents(c.unitPriceCents)}</>
                    )}
                  </div>
                </div>

                {c.pricingMode === "MANUAL" ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Teeth ({TOOTH_MIN}–{TOOTH_MAX})
                    </p>
                    {(manualToothDraftsByCatalogId[c.id] ?? [""]).map(
                      (val, idx) => (
                        <div key={idx} className="flex gap-1">
                          <Input
                            type="number"
                            min={TOOTH_MIN}
                            max={TOOTH_MAX}
                            inputMode="numeric"
                            className="h-9 w-24 text-right"
                            disabled={!canWrite}
                            placeholder={`${TOOTH_MIN}–${TOOTH_MAX}`}
                            value={val}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setManualToothDraftsByCatalogId((m) => {
                                const row = [...(m[c.id] ?? [""])];
                                if (raw === "") {
                                  row[idx] = "";
                                } else {
                                  const n = Number.parseInt(raw, 10);
                                  if (!Number.isFinite(n)) return m;
                                  row[idx] = String(
                                    Math.min(
                                      TOOTH_MAX,
                                      Math.max(TOOTH_MIN, n),
                                    ),
                                  );
                                }
                                return { ...m, [c.id]: row };
                              });
                            }}
                          />
                          {(manualToothDraftsByCatalogId[c.id] ?? [""]).length >
                          1 ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 shrink-0 text-destructive"
                              disabled={!canWrite}
                              aria-label="Remove tooth row"
                              onClick={() =>
                                setManualToothDraftsByCatalogId((m) => ({
                                  ...m,
                                  [c.id]: (m[c.id] ?? [""]).filter(
                                    (_, i) => i !== idx,
                                  ),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      ),
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 w-fit"
                      disabled={!canWrite}
                      onClick={() =>
                        setManualToothDraftsByCatalogId((m) => ({
                          ...m,
                          [c.id]: [...(m[c.id] ?? [""]), ""],
                        }))
                      }
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add tooth
                    </Button>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Line price (PHP)
                      </label>
                      <Input
                        className="text-right"
                        placeholder="0.00"
                        disabled={!canWrite}
                        value={manualPesoByCatalogId[c.id] ?? ""}
                        onChange={(e) =>
                          setManualPesoByCatalogId((m) => ({
                            ...m,
                            [c.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : c.pricingMode === "BY_LEVEL" ? (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Level
                    </label>
                    <select
                      className="h-9 w-full max-w-xs rounded-md border bg-background px-2 text-sm"
                      disabled={!canWrite || c.levelPrices.length === 0}
                      value={levelIdByCatalogId[c.id] ?? ""}
                      onChange={(e) =>
                        setLevelIdByCatalogId((m) => ({
                          ...m,
                          [c.id]: e.target.value,
                        }))
                      }
                    >
                      {c.levelPrices.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label} ({formatCents(t.unitPriceCents)})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : catalogRequiresQuantity(c.pricingMode) ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Quantity (units)
                      </label>
                      <Input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        className="h-9 w-28 text-right"
                        disabled={!canWrite}
                        value={quantityByCatalogId[c.id] ?? "1"}
                        onChange={(e) =>
                          setQuantityByCatalogId((m) => ({
                            ...m,
                            [c.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCents(c.unitPriceCents)} ×{" "}
                      {Math.max(
                        1,
                        Number.parseInt(quantityByCatalogId[c.id] ?? "1", 10) ||
                          1,
                      )}{" "}
                      ={" "}
                      {formatCents(
                        c.unitPriceCents *
                          Math.max(
                            1,
                            Number.parseInt(
                              quantityByCatalogId[c.id] ?? "1",
                              10,
                            ) || 1,
                          ),
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Flat fee: {formatCents(c.unitPriceCents)} (one line per
                    submit).
                  </p>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Case notes (optional)
                  </label>
                  <Textarea
                    rows={2}
                    className="text-sm"
                    disabled={!canWrite}
                    placeholder="Notes for this procedure on this visit…"
                    value={lineNotesDraftByCatalogId[c.id] ?? ""}
                    onChange={(e) =>
                      setLineNotesDraftByCatalogId((m) => ({
                        ...m,
                        [c.id]: e.target.value,
                      }))
                    }
                  />
                </div>

                <Button
                  type="button"
                  disabled={!canWrite || submittingCatalogId === c.id}
                  className="w-full sm:w-auto"
                  onClick={() => void submitCatalogRow(c)}
                >
                  {submittingCatalogId === c.id ? "Submitting…" : "Submit"}
                </Button>
              </div>
            ))}
          </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
