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

type Row = {
  id: string;
  status: string;
  reason: string;
  resolutionNote: string | null;
  createdAt: string;
  targetEmail: string;
  requesterEmail: string;
};

const POLL_MS = 15_000;

type Slot = {
  hasAdminII: boolean;
  pendingRequestCount: number;
  canRequestAdminII: boolean;
};

export function AdminRoleElevationRequests() {
  const [rows, setRows] = useState<Row[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [filter, setFilter] = useState<"PENDING" | "all">("PENDING");
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const q = filter === "PENDING" ? "?status=PENDING" : "";
    const res = await api<{ requests: Row[]; adminIISlot: Slot }>(
      `/api/role-elevation-requests${q}`,
    );
    if (!res.ok) {
      setErr("Could not load Admin II requests");
      return;
    }
    setErr(null);
    setRows(res.data.requests);
    setSlot(res.data.adminIISlot);
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
    const label =
      action === "approve"
        ? "grant Admin II access"
        : "reject this Admin II request";
    if (!window.confirm(`Confirm: ${label}?`)) return;
    setBusyId(id);
    setErr(null);
    const res = await api<{ error?: string }>(
      `/api/role-elevation-requests/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          resolutionNote: noteById[id]?.trim() || undefined,
        }),
      },
    );
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
      <div>
        <h3 className="text-base font-semibold">Admin II access requests</h3>
        <p className="text-sm text-muted-foreground">
          Approve once to grant advanced tools (reopen visits, devices, audit
          cleanup). Only one Admin II is allowed in the clinic.
        </p>
        {slot?.hasAdminII ? (
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            An Admin II account is already active. New approvals are blocked.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
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
      </div>
      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No requests.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.targetEmail}</TableCell>
                  <TableCell className="text-xs">{r.requesterEmail}</TableCell>
                  <TableCell className="max-w-xs text-sm">{r.reason}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>
                    {r.status === "PENDING" ? (
                      <div className="flex min-w-[12rem] flex-col gap-2">
                        <Textarea
                          placeholder="Note (optional)"
                          rows={2}
                          className="text-xs"
                          value={noteById[r.id] ?? ""}
                          onChange={(e) =>
                            setNoteById((s) => ({
                              ...s,
                              [r.id]: e.target.value,
                            }))
                          }
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busyId === r.id || slot?.hasAdminII}
                            onClick={() => void resolve(r.id, "approve")}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === r.id}
                            onClick={() => void resolve(r.id, "reject")}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {r.resolutionNote ?? "—"}
                      </span>
                    )}
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
