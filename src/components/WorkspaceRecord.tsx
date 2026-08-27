import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Printer, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import type { PatientHistoryPayload } from "@/lib/patient-history";
import type { Role, Summary } from "@/lib/clinical-types";
import { formatCents } from "@/lib/money";
import { formatVisitTicketNumber } from "@/lib/visit-ticket";
import {
  getLocationSearch,
  parseWorkspaceQuery,
  workspaceQuery,
} from "@/lib/workspace-url";

export function WorkspaceRecord(props: { initialRole: Role }) {
  const isAdmin =
    props.initialRole === "ADMIN_I" || props.initialRole === "ADMIN_II";
  const isAdminII = props.initialRole === "ADMIN_II";
  const canWrite =
    props.initialRole === "ADMIN_I" ||
    props.initialRole === "ADMIN_II" ||
    props.initialRole === "USER";
  const [visitId, setVisitId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [recordSearch, setRecordSearch] = useState("");
  const [history, setHistory] = useState<PatientHistoryPayload | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function readQuery() {
    const q = parseWorkspaceQuery(getLocationSearch());
    setVisitId(q.visitId);
    setPatientId(q.patientId);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    readQuery();
    const onQ = () => readQuery();
    window.addEventListener("popstate", onQ);
    window.addEventListener("clinicalhub:query", onQ);
    return () => {
      window.removeEventListener("popstate", onQ);
      window.removeEventListener("clinicalhub:query", onQ);
    };
  }, []);

  const loadHistory = useCallback(async () => {
    if (!patientId) {
      setHistory(null);
      return;
    }
    const res = await api<PatientHistoryPayload>(
      `/api/patients/${patientId}/history`,
    );
    if (!res.ok) {
      setErr("Could not load patient history");
      setHistory(null);
      return;
    }
    setErr(null);
    setHistory(res.data);
  }, [patientId]);

  const loadSummary = useCallback(async () => {
    if (!visitId) {
      setSummary(null);
      return;
    }
    const summaryRes = await api<Summary>(`/api/visits/${visitId}/summary`);
    if (summaryRes.ok) setSummary(summaryRes.data);
    else setSummary(null);
  }, [visitId]);

  useEffect(() => {
    if (!patientId) {
      setHistory(null);
      return;
    }
    void loadHistory();
  }, [patientId, loadHistory]);

  useEffect(() => {
    void loadSummary();
  }, [visitId, loadSummary]);

  async function removeProcedureLine(lineId: string, lineVisitId: string) {
    if (!visitId || lineVisitId !== visitId) return;
    if (!canWrite && !isAdmin) return;
    if (
      !window.confirm(
        isAdmin
          ? "Remove this procedure line? On closed visits it is recorded as (error) and excluded from totals; payments stay the same."
          : "Remove this procedure line from the visit?",
      )
    ) {
      return;
    }
    setRemovingId(lineId);
    setErr(null);
    const { ok, data } = await api<{ error?: string }>(
      `/api/visits/${visitId}/procedures/${lineId}`,
      { method: "DELETE" },
    );
    setRemovingId(null);
    if (!ok) {
      setErr(data.error ?? "Could not remove procedure line");
      return;
    }
    await loadHistory();
    await loadSummary();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("clinicalhub:query"));
    }
  }

  const filteredVisits = useMemo(() => {
    if (!history) return [];
    const q = recordSearch.trim().toLowerCase();
    if (!q) return history.visits;
    return history.visits.filter((block) => {
      const vn = block.visit.notes?.toLowerCase() ?? "";
      if (vn.includes(q)) return true;
      if (
        isAdminII &&
        String(block.visit.ticketNumber).includes(q.replace(/^#/, ""))
      ) {
        return true;
      }
      const hitLine = block.procedureLines.some(
        (r) =>
          r.catalogName.toLowerCase().includes(q) ||
          (r.catalogCode ?? "").toLowerCase().includes(q) ||
          (r.lineNotes ?? "").toLowerCase().includes(q) ||
          (r.toothNumbers ?? []).some((t) => String(t).includes(q)),
      );
      if (hitLine) return true;
      return block.payments.some(
        (p) =>
          p.method.toLowerCase().includes(q) ||
          (p.reference ?? "").toLowerCase().includes(q),
      );
    });
  }, [history, recordSearch, isAdminII]);

  if (!patientId) {
    const q = parseWorkspaceQuery(getLocationSearch());
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p className="mb-4">Select a patient from Workspace overview.</p>
        <Button asChild variant="secondary">
          <a href={`/workspace${workspaceQuery(q.patientId, q.visitId)}`}>
            Go to overview
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Label htmlFor="rs">Filter (all visits)</Label>
          <Input
            id="rs"
            value={recordSearch}
            onChange={(e) => setRecordSearch(e.target.value)}
            placeholder={
              isAdminII
                ? "Search ticket #, procedures, or payments"
                : "Search procedures or payments"
            }
            className="max-w-md"
          />
        </div>
        <Button type="button" variant="outline" asChild>
          <a
            href={`/patients/${patientId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2"
            title="Choose full history or a visit date, then print or download PDF"
          >
            <Printer className="h-4 w-4" />
            Print / download PDF
          </a>
        </Button>
      </div>

      {history ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          All visits — Charges{" "}
          <strong className="text-foreground">
            {formatCents(history.totals.chargesCents)}
          </strong>{" "}
          · Paid{" "}
          <strong className="text-foreground">
            {formatCents(history.totals.paidCents)}
          </strong>{" "}
          · Balance{" "}
          <strong className="text-foreground">
            {formatCents(history.totals.balanceCents)}
          </strong>
        </p>
      ) : null}

      {visitId && summary ? (
        <p className="rounded-md border border-highlight/60 bg-highlight/35 px-3 py-2 text-sm">
          <span className="font-medium">Selected visit</span> — Charges{" "}
          <strong>{formatCents(summary.chargesCents)}</strong> · Paid{" "}
          <strong>{formatCents(summary.paidCents)}</strong> · Balance{" "}
          <strong>{formatCents(summary.balanceCents)}</strong>
          <span className="ml-2 text-muted-foreground">
            (Remove procedure lines only applies to lines on this visit.)
          </span>
        </p>
      ) : null}

      {!history ? (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      ) : filteredVisits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching visits.</p>
      ) : (
        filteredVisits.map((block) => {
          const isSelectedVisit = visitId && block.visit.id === visitId;
          return (
            <section
              key={block.visit.id}
              className={`space-y-3 rounded-lg border p-4 ${
                isSelectedVisit ? "border-highlight/70 bg-highlight/40" : ""
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold">
                  {isAdminII && block.visit.ticketNumber >= 1 ? (
                    <span className="mr-2 font-mono text-sm text-primary">
                      {formatVisitTicketNumber(block.visit.ticketNumber)}
                    </span>
                  ) : null}
                  {new Date(block.visit.visitDate).toLocaleString()}
                  {isSelectedVisit ? (
                    <span className="ml-2 text-xs font-normal text-primary">
                      (current visit)
                    </span>
                  ) : null}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {block.visit.status === "OPEN" ? "Open" : "Closed"}
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Visit total {formatCents(block.summary.chargesCents)} · Paid{" "}
                  {formatCents(block.summary.paidCents)} · Balance{" "}
                  {formatCents(block.summary.balanceCents)}
                </p>
              </div>
              {block.visit.notes ? (
                <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm">
                  {block.visit.notes}
                </p>
              ) : null}

              <div>
                <h4 className="mb-2 text-sm font-medium">Procedures</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Teeth</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                      <TableHead className="w-12 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {block.procedureLines.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-muted-foreground"
                        >
                          No procedure lines.
                        </TableCell>
                      </TableRow>
                    ) : (
                      block.procedureLines.map((r) => {
                        const teeth = r.toothNumbers;
                        const hasTeeth = teeth && teeth.length > 0;
                        const onSelectedVisit =
                          visitId &&
                          r.visitId === visitId &&
                          block.visit.id === visitId;
                        const canRemove =
                          onSelectedVisit &&
                          ((block.visit.status === "OPEN" && (canWrite || isAdmin)) ||
                            (block.visit.status === "CLOSED" && isAdmin));
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {new Date(r.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {r.catalogName}
                              {r.voided ? (
                                <span className="ml-1 text-xs font-semibold uppercase text-amber-800">
                                  ({r.voidCategory === "REFUNDED" ? "refunded" : "error"})
                                </span>
                              ) : null}
                              {r.catalogCode ? (
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  ({r.catalogCode})
                                </span>
                              ) : null}
                              {r.procedureLevelLabelSnapshot ? (
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  Level: {r.procedureLevelLabelSnapshot}
                                </span>
                              ) : null}
                              {r.lineNotes ? (
                                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                                  Notes: {r.lineNotes}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right">
                              {hasTeeth ? "—" : r.quantity}
                            </TableCell>
                            <TableCell className="max-w-[10rem] text-right text-sm">
                              {hasTeeth ? teeth.join(", ") : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {r.voided ? (
                                <span className="text-muted-foreground line-through">
                                  —
                                </span>
                              ) : (
                                formatCents(r.lineTotalCents)
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {canRemove ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  disabled={removingId === r.id}
                                  aria-label="Remove procedure line"
                                  title="Remove procedure line"
                                  onClick={() =>
                                    void removeProcedureLine(r.id, r.visitId)
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">Payments</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {block.payments.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-muted-foreground"
                        >
                          No payments.
                        </TableCell>
                      </TableRow>
                    ) : (
                      block.payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            {new Date(p.recordedAt).toLocaleString()}
                          </TableCell>
                          <TableCell>{p.method}</TableCell>
                          <TableCell>{p.status}</TableCell>
                          <TableCell className="text-right">
                            {formatCents(p.amountCents)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
