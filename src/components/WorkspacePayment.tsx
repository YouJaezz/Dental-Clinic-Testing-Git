import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { Role, Summary } from "@/lib/clinical-types";
import { formatCents, pesoStringToCents } from "@/lib/money";
import { formatManilaDateLong, toManilaDateKey } from "@/lib/manila-date";
import { useWorkspaceContext } from "@/lib/use-workspace-context";
import { workspaceQuery } from "@/lib/workspace-url";
import { Printer } from "lucide-react";

function formatShortDate(iso: string): string {
  try {
    return formatManilaDateLong(toManilaDateKey(new Date(iso)));
  } catch {
    return iso;
  }
}

function methodLabel(method: string): string {
  const m = method.trim().toLowerCase();
  if (m === "cash") return "Cash";
  if (m === "card") return "Card";
  if (m === "check") return "Check";
  if (m === "other") return "Other";
  return method;
}

function ReceiptRow(props: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  highlight?: boolean;
  destructive?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 text-sm ${
        props.muted ? "text-muted-foreground" : ""
      } ${props.highlight ? "font-semibold text-foreground" : ""} ${
        props.destructive ? "font-semibold text-destructive" : ""
      }`}
    >
      <span className={props.strong ? "font-medium" : ""}>{props.label}</span>
      <span className="tabular-nums text-right">{props.value}</span>
    </div>
  );
}

export function WorkspacePayment(props: { initialRole: Role }) {
  const canWrite =
    props.initialRole === "ADMIN_I" ||
    props.initialRole === "ADMIN_II" ||
    props.initialRole === "USER";
  const { patientId, visitId, resolving } = useWorkspaceContext();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!visitId) {
      setSummary(null);
      return;
    }
    setSummaryLoading(true);
    const res = await api<Summary>(`/api/visits/${visitId}/summary`);
    setSummaryLoading(false);
    if (res.ok) setSummary(res.data);
    else setSummary(null);
  }, [visitId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!visitId) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadSummary();
    }, 15_000);
    return () => clearInterval(id);
  }, [visitId, loadSummary]);

  useEffect(() => {
    const refresh = () => void loadSummary();
    window.addEventListener("clinicalhub:query", refresh);
    return () => window.removeEventListener("clinicalhub:query", refresh);
  }, [loadSummary]);

  const draftCents = useMemo(() => pesoStringToCents(amount), [amount]);

  const preview = useMemo(() => {
    if (!summary) return null;
    const balance = summary.balanceCents;
    if (draftCents === null || draftCents <= 0) {
      return {
        draftCents: 0,
        balanceAfter: balance,
        overpayCents: 0,
        validDraft: false,
      };
    }
    const balanceAfter = balance - draftCents;
    return {
      draftCents,
      balanceAfter,
      overpayCents: balanceAfter < 0 ? -balanceAfter : 0,
      validDraft: true,
    };
  }, [summary, draftCents]);

  async function submit() {
    if (!visitId || !canWrite) return;
    const cents = pesoStringToCents(amount);
    if (cents === null || cents <= 0) {
      setErr("Enter a valid payment amount.");
      return;
    }
    setBusy(true);
    setErr(null);
    setOkMsg(null);
    const { ok, data } = await api<{ payment: unknown }>(
      `/api/visits/${visitId}/payments`,
      {
        method: "POST",
        body: JSON.stringify({
          amountCents: cents,
          method,
          reference: reference.trim() || null,
        }),
      },
    );
    setBusy(false);
    if (!ok) {
      setErr((data as { error?: string }).error ?? "Could not record payment");
      return;
    }
    setOkMsg("Payment recorded.");
    setAmount("");
    setReference("");
    await loadSummary();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("clinicalhub:query"));
    }
  }

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,22rem)] lg:items-start">
      <section
        className="rounded-lg border-2 border-border bg-card font-mono text-[13px] shadow-sm"
        aria-label="Visit charges and payments receipt"
      >
        <header className="border-b border-dashed border-border bg-muted/30 px-4 py-3 text-center">
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Visit receipt
          </p>
          <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">
            Updates as procedures and payments change
          </p>
        </header>

        <div className="space-y-4 px-4 py-4">
          {!summary && summaryLoading ? (
            <p className="font-sans text-sm text-muted-foreground">Loading…</p>
          ) : summary ? (
            <>
              <div>
                <p className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Charges
                </p>
                {summary.chargeLines.length === 0 ? (
                  <p className="font-sans text-sm text-muted-foreground">
                    No procedure charges yet.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {summary.chargeLines.map((line) => (
                      <li
                        key={line.id}
                        className="flex justify-between gap-2 border-b border-dotted border-border/60 pb-1 last:border-0"
                      >
                        <span className="min-w-0 font-sans text-foreground">
                          {line.catalogName}
                          {line.quantity > 1 ? (
                            <span className="text-muted-foreground">
                              {" "}
                              ×{line.quantity}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatCents(line.lineTotalCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 border-t border-border pt-2">
                  <ReceiptRow
                    label="Total charges"
                    value={formatCents(summary.chargesCents)}
                    strong
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payments recorded
                </p>
                {summary.payments.length === 0 ? (
                  <p className="font-sans text-sm text-muted-foreground">
                    None yet.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {summary.payments.map((p) => (
                      <li
                        key={p.id}
                        className="flex justify-between gap-2 border-b border-dotted border-border/60 pb-1 last:border-0"
                      >
                        <span className="min-w-0 font-sans text-muted-foreground">
                          {formatShortDate(p.recordedAt)} ·{" "}
                          {methodLabel(p.method)}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </span>
                        <span className="shrink-0 tabular-nums text-foreground">
                          −{formatCents(p.amountCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 border-t border-border pt-2">
                  <ReceiptRow
                    label="Total paid"
                    value={formatCents(summary.paidCents)}
                    muted
                  />
                </div>
              </div>

              <div className="rounded-md border-2 border-highlight/50 bg-highlight/30 px-3 py-3">
                <ReceiptRow
                  label="Balance due"
                  value={formatCents(summary.balanceCents)}
                  highlight
                  destructive={summary.balanceCents > 0}
                />
              </div>

              {preview?.validDraft ? (
                <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-3 font-sans">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                    If you save this payment
                  </p>
                  <ReceiptRow
                    label="This payment"
                    value={`−${formatCents(preview.draftCents)}`}
                  />
                  <ReceiptRow
                    label="New balance"
                    value={formatCents(
                      preview.balanceAfter > 0 ? preview.balanceAfter : 0,
                    )}
                    highlight
                    destructive={preview.balanceAfter > 0}
                  />
                  {preview.overpayCents > 0 ? (
                    <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                      Payment exceeds balance by{" "}
                      {formatCents(preview.overpayCents)}.
                    </p>
                  ) : preview.balanceAfter <= 0 ? (
                    <p className="mt-2 text-xs text-green-700 dark:text-green-400">
                      Visit would be fully paid.
                    </p>
                  ) : null}
                </div>
              ) : amount.trim() ? (
                <p className="font-sans text-xs text-muted-foreground">
                  Enter a valid amount to preview the new balance.
                </p>
              ) : null}
            </>
          ) : (
            <p className="font-sans text-sm text-destructive">
              Could not load visit totals.
            </p>
          )}
        </div>

        <footer className="border-t border-dashed border-border px-4 py-2 text-center font-sans text-[10px] text-muted-foreground">
          Sta.Isabel Dental Clinic · current visit only
        </footer>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div>
          <h2 className="text-base font-semibold">Record payment</h2>
          <p className="text-sm text-muted-foreground">
            Amounts on the receipt update live while you type. For long
            treatments, print a billing statement after each payment so the
            patient has an up-to-date balance.
          </p>
        </div>

        {summary && patientId && visitId ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" asChild>
              <a
                href={`/workspace/payment-receipt${workspaceQuery(patientId, visitId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
              >
                <Printer className="h-4 w-4" aria-hidden />
                Print statement
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a
                href={`/workspace/payment-receipt${workspaceQuery(patientId, visitId)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open printable page
              </a>
            </Button>
          </div>
        ) : null}

        {summary && summary.visitStatus === "OPEN" ? (
          <p className="rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-amber-950">
            Visit still open — new procedures may be added and balance may
            change. Give the patient a printed statement dated today; print
            again when they return to pay more.
          </p>
        ) : null}

        {err ? (
          <p className="text-sm text-destructive" role="alert">
            {err}
          </p>
        ) : null}
        {okMsg ? (
          <p className="text-sm text-green-600 dark:text-green-500" role="status">
            {okMsg}
          </p>
        ) : null}

        {summary ? (
          <div className="rounded-md border bg-muted/25 p-3 text-sm">
            <p className="text-muted-foreground">Balance due now</p>
            <p
              className={
                summary.balanceCents > 0
                  ? "text-2xl font-semibold tabular-nums text-destructive"
                  : "text-2xl font-semibold tabular-nums text-foreground"
              }
            >
              {formatCents(summary.balanceCents)}
            </p>
            {preview?.validDraft ? (
              <p className="mt-1 text-xs text-muted-foreground">
                After entry:{" "}
                <strong className="text-foreground">
                  {formatCents(
                    preview.balanceAfter > 0 ? preview.balanceAfter : 0,
                  )}
                </strong>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="amt">Amount (PHP)</Label>
            <Input
              id="amt"
              className="text-right text-lg tabular-nums"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setOkMsg(null);
              }}
              placeholder="0.00"
              disabled={!canWrite || busy}
              inputMode="decimal"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="meth">Method</Label>
            <select
              id="meth"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={!canWrite || busy}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ref">Reference (optional)</Label>
            <Input
              id="ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={!canWrite || busy}
            />
          </div>
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={!canWrite || busy || !preview?.validDraft}
          onClick={() => void submit()}
        >
          {busy ? "Saving…" : "Save payment"}
        </Button>
        {!canWrite ? (
          <p className="text-xs text-muted-foreground">
            Trainee accounts cannot record payments.
          </p>
        ) : null}
      </section>
    </div>
  );
}
