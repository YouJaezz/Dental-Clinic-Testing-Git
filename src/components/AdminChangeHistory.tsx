import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { AuditLogPublic } from "@/lib/audit-log";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatAction(action: string): string {
  if (action === "procedure.voided") return "Procedure voided (error/refunded)";
  if (action === "correction_request.created") return "Correction request";
  if (action === "correction_request.approved") return "Request approved";
  if (action === "correction_request.rejected") return "Request rejected";
  return action.replace(/\./g, " · ").replace(/_/g, " ");
}

export function AdminChangeHistory() {
  const [logs, setLogs] = useState<AuditLogPublic[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    const res = await api<{ logs: AuditLogPublic[] }>("/api/audit-logs?limit=200");
    setLoading(false);
    if (!res.ok) {
      setErr("Could not load change history");
      return;
    }
    setLogs(res.data.logs);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          System-wide activity log (administrators only).
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatWhen(log.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {log.actorEmail ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm capitalize text-muted-foreground">
                    {formatAction(log.action)}
                  </TableCell>
                  <TableCell className="text-sm">{log.summary}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
