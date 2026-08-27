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
import { api } from "@/lib/api-client";
import type { Role } from "@/lib/clinical-types";
import { formatCents } from "@/lib/money";
import { formatVisitTicketNumber } from "@/lib/visit-ticket";
import type {
  OngoingVisitRow,
  OngoingVisitSort,
  OngoingVisitsReport,
} from "@/lib/ongoing-visits";
import { workspaceQuery } from "@/lib/workspace-url";
import { ExternalLink } from "lucide-react";

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function StatusBadges(props: { row: OngoingVisitRow }) {
  const badges: { label: string; className: string }[] = [];
  if (props.row.daysOpen >= 30) {
    badges.push({
      label: "Long-running",
      className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    });
  }
  if (props.row.balanceCents > 0) {
    badges.push({
      label: "Balance due",
      className: "bg-destructive/10 text-destructive",
    });
  }
  if (props.row.paidCents > 0 && props.row.balanceCents > 0) {
    badges.push({
      label: "Installments",
      className: "bg-highlight/50 text-primary",
    });
  }
  if (badges.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${b.className}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

export function OngoingVisitsHub(props: { initialRole: Role }) {
  const isAdminII = props.initialRole === "ADMIN_II";
  const [report, setReport] = useState<OngoingVisitsReport | null>(null);
  const [sort, setSort] = useState<OngoingVisitSort>("oldest");
  const [catalogFilter, setCatalogFilter] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextSort: OngoingVisitSort, procedureCatalogId?: string) => {
      setLoading(true);
      setErr(null);
      const q = new URLSearchParams();
      q.set("sort", nextSort);
      if (procedureCatalogId) {
        q.set("catalogId", procedureCatalogId);
      }
      const res = await api<{ report: OngoingVisitsReport }>(
        `/api/visits/open?${q.toString()}`,
      );
      setLoading(false);
      if (!res.ok) {
        setReport(null);
        setErr("Could not load ongoing visits");
        return;
      }
      setReport(res.data.report);
      setSort(res.data.report.sort);
    },
    [],
  );

  useEffect(() => {
    void load(sort, catalogFilter || undefined);
  }, [load, sort, catalogFilter]);

  const filtered = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    if (!q) return report.visits;
    return report.visits.filter(
      (v) =>
        v.patientName.toLowerCase().includes(q) ||
        (v.contactNumber?.toLowerCase().includes(q) ?? false) ||
        v.procedureSummary.toLowerCase().includes(q) ||
        (v.notesSummary?.toLowerCase().includes(q) ?? false) ||
        (isAdminII && String(v.ticketNumber).includes(q.replace(/^#/, ""))),
    );
  }, [report, search, isAdminII]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Open visits stay active until closed in Workspace — suited for long
        treatments (e.g. dentures) and installment payments while work is in
        progress.
      </p>

      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {report ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Open visits</p>
            <p className="mt-1 text-2xl font-semibold">{report.summary.openCount}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total charges</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatCents(report.summary.chargesCents)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Collected so far</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatCents(report.summary.paidCents)}
            </p>
          </div>
          <div className="rounded-lg border-2 border-highlight/60 bg-highlight/35 p-4">
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatCents(report.summary.balanceCents)}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1 space-y-2">
          <Label htmlFor="ongoing-search">Search</Label>
          <Input
            id="ongoing-search"
            placeholder={
              isAdminII
                ? "Patient, ticket #, contact, procedures, notes…"
                : "Patient, contact, procedures, notes…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="min-w-[14rem] max-w-[20rem] space-y-2">
          <Label htmlFor="ongoing-procedure">Procedure</Label>
          <select
            id="ongoing-procedure"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={catalogFilter}
            onChange={(e) => setCatalogFilter(e.target.value)}
            disabled={!report && loading}
          >
            <option value="">All procedures</option>
            {(report?.catalogFilterOptions ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ${c.name}` : c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Show open visits that include this catalog procedure (billing
            lines, not voided).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ongoing-sort">Sort by</Label>
          <select
            id="ongoing-sort"
            className="flex h-10 w-full min-w-[10rem] rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as OngoingVisitSort)}
          >
            <option value="oldest">Longest open first</option>
            <option value="balance">Highest balance</option>
            <option value="activity">Recent activity</option>
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load(sort, catalogFilter || undefined)}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {loading && !report ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {report && report.visits.length === 0
            ? catalogFilter && report.catalogFilterId
              ? "No open visits include this procedure yet. Add it from Workspace, or choose another procedure."
              : "No open visits right now. Start a visit from Workspace when a patient is in treatment."
            : "No visits match your search."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdminII ? (
                  <TableHead className="whitespace-nowrap">Ticket</TableHead>
                ) : null}
                <TableHead>Patient</TableHead>
                <TableHead>Visit date</TableHead>
                <TableHead className="min-w-[10rem] max-w-[14rem]">
                  Procedures
                </TableHead>
                <TableHead className="min-w-[10rem] max-w-[18rem]">
                  Notes
                </TableHead>
                <TableHead className="text-right">Days open</TableHead>
                <TableHead className="text-right">Charges</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
                <TableRow key={v.visitId}>
                  {isAdminII ? (
                    <TableCell className="align-top font-mono text-sm font-semibold tabular-nums">
                      {v.ticketNumber >= 1
                        ? formatVisitTicketNumber(v.ticketNumber)
                        : "—"}
                    </TableCell>
                  ) : null}
                  <TableCell className="align-top">
                    <div className="font-medium">{v.patientName}</div>
                    {v.contactNumber ? (
                      <p className="text-xs text-muted-foreground">
                        {v.contactNumber}
                      </p>
                    ) : null}
                    <StatusBadges row={v} />
                  </TableCell>
                  <TableCell className="align-top text-sm whitespace-nowrap">
                    {v.visitDateLabel}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {v.procedureSummary ? (
                      <p className="line-clamp-4 whitespace-normal text-foreground">
                        {v.procedureSummary}
                      </p>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {v.notesSummary ? (
                      <p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">
                        {v.notesSummary}
                      </p>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-right tabular-nums">
                    {v.daysOpen}
                  </TableCell>
                  <TableCell className="align-top text-right">
                    {formatCents(v.chargesCents)}
                    {v.procedureLineCount > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {v.procedureLineCount} line
                        {v.procedureLineCount === 1 ? "" : "s"}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top text-right">
                    {formatCents(v.paidCents)}
                    {v.lastPaymentAt ? (
                      <p className="text-xs text-muted-foreground">
                        Last {formatRelative(v.lastPaymentAt)}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell
                    className={
                      v.balanceCents > 0
                        ? "align-top text-right font-medium text-destructive"
                        : "align-top text-right"
                    }
                  >
                    {formatCents(v.balanceCents)}
                  </TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground whitespace-nowrap">
                    {formatRelative(v.lastActivityAt)}
                  </TableCell>
                  <TableCell className="align-top text-right">
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
    </div>
  );
}
