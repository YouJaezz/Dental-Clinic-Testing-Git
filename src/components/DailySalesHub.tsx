import { useCallback, useEffect, useState } from "react";
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
import { api } from "@/lib/api-client";
import type { DailySalesReport } from "@/lib/daily-sales";
import { formatCents } from "@/lib/money";
import { workspaceQuery } from "@/lib/workspace-url";
import { ExternalLink, Printer } from "lucide-react";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function SummaryCard(props: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        props.emphasis
          ? "rounded-lg border-2 border-highlight/60 bg-highlight/35 p-4"
          : "rounded-lg border bg-card p-4"
      }
    >
      <p className="text-sm text-muted-foreground">{props.label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{props.value}</p>
      {props.hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{props.hint}</p>
      ) : null}
    </div>
  );
}

export function DailySalesHub(props: { isAdmin: boolean }) {
  const [report, setReport] = useState<DailySalesReport | null>(null);
  const [pickDate, setPickDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (date?: string) => {
      setLoading(true);
      setErr(null);
      try {
        const q =
          props.isAdmin && date ? `?date=${encodeURIComponent(date)}` : "";
        const res = await api<{ report: DailySalesReport; error?: string }>(
          `/api/sales/daily${q}`,
        );
        if (!res.ok) {
          setReport(null);
          setErr(
            res.data?.error ??
              "Could not load daily sales. If this persists, run npm run db:migrate.",
          );
          return;
        }
        const r = res.data.report;
        if (!r) {
          setReport(null);
          setErr("Could not load daily sales.");
          return;
        }
        setReport({
          ...r,
          voidedLines: r.voidedLines ?? [],
          voidedLineCount: r.voidedLineCount ?? r.voidedLines?.length ?? 0,
          voidedChargesCents: r.voidedChargesCents ?? 0,
        });
        if (props.isAdmin) {
          setPickDate(r.date);
        }
      } catch {
        setReport(null);
        setErr("Could not load daily sales.");
      } finally {
        setLoading(false);
      }
    },
    [props.isAdmin],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !report) {
    return <p className="text-sm text-muted-foreground">Loading daily sales…</p>;
  }

  if (!report && !err) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Daily sales data is unavailable. Refresh the page or contact an
        administrator.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {props.isAdmin ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-4">
          <div className="space-y-2">
            <Label htmlFor="sales-date">Date (Manila)</Label>
            <Input
              id="sales-date"
              type="date"
              value={pickDate}
              onChange={(e) => setPickDate(e.target.value)}
              className="w-44"
            />
          </div>
          <Button type="button" onClick={() => void load(pickDate)}>
            Apply
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (report?.todayKey) {
                setPickDate(report.todayKey);
                void load(report.todayKey);
              }
            }}
          >
            Today
          </Button>
          <Button type="button" variant="secondary" asChild>
            <a
              href={`/sales/report${pickDate ? `?date=${encodeURIComponent(pickDate)}` : ""}`}
            >
              <Printer className="mr-1.5 inline h-4 w-4" aria-hidden />
              Print / PDF report
            </a>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing collections and visits for{" "}
            <span className="font-medium text-foreground">
              {report?.dateLabel ?? "today"}
            </span>{" "}
            (Manila time). Contact an administrator to view other dates.
          </p>
          <Button type="button" variant="secondary" asChild>
            <a href="/sales/report">
              <Printer className="mr-1.5 inline h-4 w-4" aria-hidden />
              Print / PDF report
            </a>
          </Button>
        </div>
      )}

      {report ? (
        <>
          <div>
            <h2 className="mb-1 text-lg font-medium">{report.dateLabel}</h2>
            <p className="text-sm text-muted-foreground">
              Collections use payment time; visit charges use the visit date.
            </p>
          </div>

          <section>
            <h3 className="mb-3 text-base font-medium">
              Existing unpaid balances
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Amounts still owed on visits that are not fully paid (includes
              long-running treatments and installment plans). Payments collected
              on {report.dateLabel} toward these visits are shown in the last
              column.
            </p>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <SummaryCard
                label="Total existing balance"
                value={formatCents(report.existingBalanceCents)}
                hint={`${report.existingBalanceVisitCount} visit${report.existingBalanceVisitCount === 1 ? "" : "s"} with balance`}
                emphasis
              />
              <SummaryCard
                label="Collected today (toward these)"
                value={formatCents(
                  report.existingBalances.reduce(
                    (s, r) => s + r.collectedOnReportDateCents,
                    0,
                  ),
                )}
                hint="Installments applied on this date"
              />
            </div>
            {report.existingBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No outstanding balances — all visits are fully paid.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Visit date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead className="text-right">Charges</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">
                        Collected today
                      </TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.existingBalances.map((v) => (
                      <TableRow key={v.visitId}>
                        <TableCell className="font-medium">
                          {v.patientName}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {v.visitDateLabel}
                        </TableCell>
                        <TableCell className="text-sm">
                          {v.status === "OPEN" ? "Open" : "Closed"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {v.daysOpen}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCents(v.chargesCents)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCents(v.paidCents)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-destructive">
                          {formatCents(v.balanceCents)}
                        </TableCell>
                        <TableCell className="text-right">
                          {v.collectedOnReportDateCents > 0
                            ? formatCents(v.collectedOnReportDateCents)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <a
                            href={`/workspace${workspaceQuery(v.patientId, v.visitId)}`}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                          >
                            Open
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-base font-medium">
              Procedures removed (error / refunded)
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Lines voided on {report.dateLabel}. These amounts are excluded
              from visit charges above; cash collected on this date is not
              reversed.
            </p>
            {(report.voidedLines ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                No procedure lines were removed on this date.
              </p>
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <SummaryCard
                    label="Lines removed"
                    value={String((report.voidedLines ?? []).length)}
                    hint="Recorded on this date"
                    emphasis
                  />
                  <SummaryCard
                    label="Charges removed"
                    value={formatCents(report.voidedChargesCents ?? 0)}
                    hint="No longer counted in totals"
                  />
                </div>
                <div className="overflow-x-auto rounded-md border border-amber-200/80 bg-amber-50/40">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time removed</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Visit date</TableHead>
                        <TableHead>Procedure</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(report.voidedLines ?? []).map((row) => (
                        <TableRow key={row.lineId}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatTime(row.voidedAt)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.patientName}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {row.visitDateLabel}
                          </TableCell>
                          <TableCell>{row.catalogName}</TableCell>
                          <TableCell>
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-900">
                              {row.categoryLabel}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium line-through decoration-amber-800/60">
                            {formatCents(row.lineTotalCents)}
                          </TableCell>
                          <TableCell className="max-w-[14rem] text-sm text-muted-foreground">
                            {row.voidReason?.replace(/^\[(ERROR|REFUNDED)\]\s*/i, "") ??
                              "—"}
                            {row.voidedByEmail ? (
                              <span className="mt-0.5 block text-xs">
                                By {row.voidedByEmail}
                              </span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-base font-medium">Daily collections</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                label="Total collected"
                value={formatCents(report.collectedCents)}
                hint={`${report.paymentCount} payment${report.paymentCount === 1 ? "" : "s"}`}
                emphasis
              />
              {report.byMethod.map((m) => (
                <SummaryCard
                  key={m.method}
                  label={m.method}
                  value={formatCents(m.amountCents)}
                  hint={`${m.count} payment${m.count === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-base font-medium">Visits on this date</h3>
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <SummaryCard
                label="Procedure charges"
                value={formatCents(report.chargesCents)}
                hint={`${report.visitCount} visit${report.visitCount === 1 ? "" : "s"}`}
              />
              <SummaryCard
                label="Paid (on these visits)"
                value={formatCents(report.paidOnVisitsCents)}
              />
              <SummaryCard
                label="Outstanding balance"
                value={formatCents(report.balanceOnVisitsCents)}
                hint="Charges minus payments on these visits"
              />
            </div>

            {report.visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No visits recorded for this date.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead className="text-right">Charges</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Collected today</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.visits.map((v) => (
                      <TableRow key={v.visitId}>
                        <TableCell className="font-medium">
                          {v.patientName}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCents(v.chargesCents)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCents(v.paidCents)}
                        </TableCell>
                        <TableCell
                          className={
                            v.balanceCents > 0
                              ? "text-right text-destructive"
                              : "text-right"
                          }
                        >
                          {formatCents(v.balanceCents)}
                        </TableCell>
                        <TableCell className="text-right">
                          {v.collectedTodayCents > 0
                            ? formatCents(v.collectedTodayCents)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-base font-medium">Payments received</h3>
            {report.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payments recorded for this date.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatTime(p.recordedAt)}
                        </TableCell>
                        <TableCell>{p.patientName}</TableCell>
                        <TableCell>{p.method}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCents(p.amountCents)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.reference ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Refreshing…</p>
      ) : null}
    </div>
  );
}
