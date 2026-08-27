import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { formatCents } from "@/lib/money";
import { workspaceQuery } from "@/lib/workspace-url";

type CorrectionRequestRow = {
  id: string;
  status: string;
  visitId: string;
  lineId: string;
  reason: string;
  resolutionNote: string | null;
  createdAt: string;
  requesterEmail: string;
  patientName: string;
  visitDate: string;
  catalogName: string;
  lineTotalCents: number;
};

const POLL_MS = 15_000;

export function AdminCorrectionRequests() {
  const [rows, setRows] = useState<CorrectionRequestRow[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "all">("PENDING");
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const q = filter === "PENDING" ? "?status=PENDING" : "";
    const res = await api<{ requests: CorrectionRequestRow[] }>(
      `/api/correction-requests${q}`,
    );
    if (!res.ok) {
      setErr("Could not load correction requests");
      return;
    }
    setErr(null);
    setRows(res.data.requests);
  }, [filter]);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  async function resolve(id: string, action: "approve" | "reject") {
    const label = action === "approve" ? "approve and void this procedure" : "reject this request";
    if (!window.confirm(`Confirm: ${label}?`)) return;
    setBusyId(id);
    setErr(null);
    const res = await api<{ error?: string }>(`/api/correction-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        resolutionNote: noteById[id]?.trim() || undefined,
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      setErr(res.data.error ?? "Action failed");
      return;
    }
    await load();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("clinicalhub:correction-requests"));
    }
  }

  const pendingCount = rows.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Correction requests</h2>
          <p className="text-sm text-muted-foreground">
            Staff requests to void mistaken procedure lines on closed visits.
            Voiding removes the charge from balances; recorded payments are
            unchanged.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={filter === "PENDING" ? "default" : "secondary"}
            onClick={() => setFilter("PENDING")}
          >
            Pending
            {filter === "PENDING" && pendingCount > 0 ? (
              <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">
                {pendingCount}
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === "all" ? "default" : "secondary"}
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filter === "PENDING"
            ? "No pending requests."
            : "No correction requests yet."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Submitted</TableHead>
              <TableHead>Patient / visit</TableHead>
              <TableHead>Procedure</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const ws = workspaceQuery(null, r.visitId);
              return (
                <TableRow
                  key={r.id}
                  className={
                    r.status === "PENDING"
                      ? "bg-highlight/25"
                      : undefined
                  }
                >
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                    <div className="mt-0.5">{r.requesterEmail}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.patientName}</div>
                    <div className="text-xs text-muted-foreground">
                      Visit {r.visitDate}
                    </div>
                    <a
                      href={`/workspace/procedures${ws}`}
                      className="text-xs text-primary underline-offset-2 hover:underline"
                    >
                      Open in workspace
                    </a>
                  </TableCell>
                  <TableCell>{r.catalogName}</TableCell>
                  <TableCell className="text-right">
                    {formatCents(r.lineTotalCents)}
                  </TableCell>
                  <TableCell className="max-w-[14rem] text-sm">
                    {r.reason}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        r.status === "PENDING"
                          ? "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
                          : r.status === "APPROVED"
                            ? "rounded bg-muted px-2 py-0.5 text-xs"
                            : "rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                      }
                    >
                      {r.status}
                    </span>
                    {r.resolutionNote ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.resolutionNote}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top text-right">
                    {r.status === "PENDING" ? (
                      <div className="flex flex-col items-end gap-2">
                        <Textarea
                          className="min-h-[2.5rem] w-40 text-xs"
                          placeholder="Note (optional)"
                          value={noteById[r.id] ?? ""}
                          onChange={(e) =>
                            setNoteById((m) => ({
                              ...m,
                              [r.id]: e.target.value,
                            }))
                          }
                        />
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busyId === r.id}
                            onClick={() => void resolve(r.id, "approve")}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busyId === r.id}
                            onClick={() => void resolve(r.id, "reject")}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
