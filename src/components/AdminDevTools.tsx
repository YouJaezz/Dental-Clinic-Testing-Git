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
import type { Role, UserRow } from "@/lib/clinical-types";
import { ROLES_ASSIGNABLE_BY_ADMIN_II } from "@/lib/user-roles";
import { useLocale } from "@/lib/use-locale";
import type { VisitTicketLookupResult } from "@/lib/visit-ticket";
import {
  formatVisitTicketNumber,
  parseVisitTicketQuery,
} from "@/lib/visit-ticket";
import { workspaceQuery } from "@/lib/workspace-url";

type SessionRow = {
  id: string;
  userId: string;
  email: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceLabel: string | null;
};

type BlockedRow = {
  id: string;
  ipAddress: string | null;
  deviceLabel: string | null;
  reason: string;
  createdAt: string;
  blockedByEmail: string;
};

type AuditRow = {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  action: string;
  summary: string;
};

function roleLabel(role: Role): string {
  if (role === "ADMIN_I") return "Admin I";
  if (role === "ADMIN_II") return "Admin II";
  return role;
}

/** Admin II tools: roles, device blocking, reopen visits, audit. */
export function AdminAdvancedTools() {
  const { t } = useLocale();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [blocks, setBlocks] = useState<BlockedRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [reopenVisitId, setReopenVisitId] = useState("");
  const [ticketLookupInput, setTicketLookupInput] = useState("");
  const [ticketLookupResult, setTicketLookupResult] =
    useState<VisitTicketLookupResult | null>(null);
  const [ticketLookupErr, setTicketLookupErr] = useState<string | null>(null);
  const [blockIp, setBlockIp] = useState("");
  const [blockLabel, setBlockLabel] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [gateNew, setGateNew] = useState("");
  const [gateConfirm, setGateConfirm] = useState("");
  const [gateConfigured, setGateConfigured] = useState<boolean | null>(null);
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const [sRes, bRes, uRes, aRes, gRes] = await Promise.all([
      api<{ sessions: SessionRow[] }>("/api/admin/sessions"),
      api<{ blocks: BlockedRow[] }>("/api/admin/blocked-devices"),
      api<{ users: UserRow[]; currentUserId: string }>(
        "/api/admin/users-for-roles",
      ),
      api<{ logs: AuditRow[] }>("/api/audit-logs?limit=80"),
      api<{ configured: boolean }>("/api/admin/gate"),
    ]);
    if (sRes.ok) setSessions(sRes.data.sessions);
    if (bRes.ok) setBlocks(bRes.data.blocks);
    if (uRes.ok) {
      setUsers(
        uRes.data.users.map((u) => ({
          ...u,
          createdAt:
            typeof u.createdAt === "string"
              ? u.createdAt
              : new Date(u.createdAt as unknown as number).toISOString(),
        })),
      );
      setCurrentUserId(uRes.data.currentUserId);
    }
    if (aRes.ok) setAudit(aRes.data.logs);
    if (gRes.ok) setGateConfigured(gRes.data.configured);
    if (!sRes.ok || !bRes.ok || !uRes.ok || !aRes.ok) {
      setErr("Could not load advanced admin data");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function reopenVisit() {
    const raw = reopenVisitId.trim();
    if (!raw) return;

    let visitId = raw;
    const ticket = parseVisitTicketQuery(raw);
    if (ticket != null) {
      setBusy(true);
      setErr(null);
      const lookup = await api<{ visit: VisitTicketLookupResult }>(
        `/api/admin/visit-tickets/lookup?ticket=${ticket}`,
      );
      setBusy(false);
      if (!lookup.ok) {
        setErr(
          (lookup.data as { error?: string }).error ??
            "Could not find visit by ticket number",
        );
        return;
      }
      visitId = lookup.data.visit.visitId;
    }

    setBusy(true);
    setErr(null);
    const res = await api(`/api/visits/${visitId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "OPEN" }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((res.data as { error?: string }).error ?? "Could not reopen visit");
      return;
    }
    setReopenVisitId("");
    await load();
  }

  async function lookupTicket() {
    const ticket = parseVisitTicketQuery(ticketLookupInput);
    if (ticket == null) {
      setTicketLookupErr("Enter a valid ticket number (e.g. 1042 or #1042).");
      setTicketLookupResult(null);
      return;
    }
    setBusy(true);
    setTicketLookupErr(null);
    const res = await api<{
      visit: VisitTicketLookupResult;
      workspaceHref: string;
    }>(`/api/admin/visit-tickets/lookup?ticket=${ticket}`);
    setBusy(false);
    if (!res.ok) {
      setTicketLookupResult(null);
      setTicketLookupErr(
        (res.data as { error?: string }).error ?? "Visit not found",
      );
      return;
    }
    setTicketLookupResult(res.data.visit);
  }

  async function changeRole(userId: string, role: Role) {
    setBusy(true);
    setErr(null);
    const res = await api(`/api/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((res.data as { error?: string }).error ?? "Could not update role");
      return;
    }
    await load();
  }

  async function blockSession(session: SessionRow) {
    const reason = window.prompt(
      `Block this device and sign it out?\n${session.deviceLabel ?? "Unknown"} · ${session.ipAddress ?? "no IP"}\n\nReason:`,
    );
    if (!reason?.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await api<{ error?: string; revokedSessions?: number }>(
      `/api/admin/sessions/${session.id}/block`,
      {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      setErr(res.data.error ?? "Could not block device");
      return;
    }
    await load();
  }

  async function addManualBlock() {
    if (!blockReason.trim()) {
      setErr("Enter a reason for the block");
      return;
    }
    if (!blockIp.trim() && !blockLabel.trim()) {
      setErr("Enter an IP address and/or device label to block");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await api<{ error?: string }>("/api/admin/blocked-devices", {
      method: "POST",
      body: JSON.stringify({
        ipAddress: blockIp.trim() || null,
        deviceLabel: blockLabel.trim() || null,
        reason: blockReason.trim(),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data.error ?? "Could not block");
      return;
    }
    setBlockIp("");
    setBlockLabel("");
    setBlockReason("");
    await load();
  }

  async function unblock(id: string) {
    if (!window.confirm("Remove this block? The device can sign in again.")) return;
    setBusy(true);
    const res = await api(`/api/admin/blocked-devices/${id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setErr("Could not unblock");
      return;
    }
    await load();
  }

  async function saveAdminGateCode() {
    if (gateNew.length < 4) {
      setErr("Passcode must be at least 4 characters");
      return;
    }
    if (gateNew !== gateConfirm) {
      setErr("Passcodes do not match");
      return;
    }
    setBusy(true);
    setErr(null);
    setGateMsg(null);
    const res = await api<{ error?: string }>("/api/admin/gate", {
      method: "PUT",
      body: JSON.stringify({ newCode: gateNew, confirmCode: gateConfirm }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data.error ?? "Could not save passcode");
      return;
    }
    setGateNew("");
    setGateConfirm("");
    setGateConfigured(true);
    setGateMsg("Administration passcode saved. Share it only with Admin I.");
  }

  async function deleteAudit(id: string) {
    if (!confirm("Delete this audit entry permanently?")) return;
    setBusy(true);
    const res = await api(`/api/audit-logs/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setErr("Could not delete audit entry");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-8">
      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <h3 className="text-base font-semibold">Administration passcode</h3>
        <p className="text-sm text-muted-foreground">
          Admin I must enter this passcode to open{" "}
          <strong>Administration</strong> and <strong>Change history</strong>.
          {gateConfigured
            ? " A passcode is already set — saving again replaces it."
            : " Set one before Admin I can use those areas."}
        </p>
        {gateMsg ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
            {gateMsg}
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="gate-new">New passcode</Label>
            <Input
              id="gate-new"
              type="password"
              autoComplete="new-password"
              className="w-40 font-mono"
              value={gateNew}
              onChange={(e) => setGateNew(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gate-confirm">Confirm</Label>
            <Input
              id="gate-confirm"
              type="password"
              autoComplete="new-password"
              className="w-40 font-mono"
              value={gateConfirm}
              onChange={(e) => setGateConfirm(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={busy || gateNew.length < 4}
            onClick={() => void saveAdminGateCode()}
          >
            Save passcode
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">{t("dev.users")}</h3>
        <p className="text-sm text-muted-foreground">
          Change roles for staff and Admin I. Admin II accounts cannot be edited
          here.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>{t("dev.role")}</TableHead>
                <TableHead>{t("dev.changeRole")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const editable =
                  u.role !== "ADMIN_II" && u.id !== currentUserId;
                return (
                  <TableRow key={u.id}>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{roleLabel(u.role)}</TableCell>
                    <TableCell>
                      {editable ? (
                        <select
                          className="h-9 rounded-md border px-2 text-sm"
                          value={u.role}
                          disabled={busy}
                          onChange={(e) =>
                            void changeRole(
                              u.id,
                              e.target.value as (typeof ROLES_ASSIGNABLE_BY_ADMIN_II)[number],
                            )
                          }
                        >
                          {ROLES_ASSIGNABLE_BY_ADMIN_II.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
        <h3 className="text-base font-semibold">Blocked devices</h3>
        <p className="text-sm text-muted-foreground">
          Block unknown or unauthorized devices by IP and/or device type. Blocked
          devices cannot sign in and active sessions are signed out.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="block-ip">IP address</Label>
            <Input
              id="block-ip"
              className="w-40 font-mono text-sm"
              placeholder="e.g. 192.168.1.5"
              value={blockIp}
              onChange={(e) => setBlockIp(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="block-label">Device label</Label>
            <Input
              id="block-label"
              className="w-48 text-sm"
              placeholder="e.g. Chrome · Windows"
              value={blockLabel}
              onChange={(e) => setBlockLabel(e.target.value)}
            />
          </div>
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label htmlFor="block-reason">Reason</Label>
            <Input
              id="block-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void addManualBlock()}
          >
            Block device
          </Button>
        </div>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocked devices.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dev.deviceIp")}</TableHead>
                  <TableHead>{t("dev.deviceLabel")}</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Blocked by</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocks.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">
                      {b.ipAddress ?? "—"}
                    </TableCell>
                    <TableCell>{b.deviceLabel ?? "—"}</TableCell>
                    <TableCell className="max-w-xs text-sm">{b.reason}</TableCell>
                    <TableCell className="text-xs">{b.blockedByEmail}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void unblock(b.id)}
                      >
                        Unblock
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{t("dev.devices")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {t("dev.loadSessions")}
          </Button>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dev.noSessions")}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dev.deviceEmail")}</TableHead>
                  <TableHead>{t("dev.role")}</TableHead>
                  <TableHead>{t("dev.deviceLabel")}</TableHead>
                  <TableHead>{t("dev.deviceIp")}</TableHead>
                  <TableHead>{t("dev.deviceWhen")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.email}</TableCell>
                    <TableCell>{roleLabel(s.role)}</TableCell>
                    <TableCell>{s.deviceLabel ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.ipAddress ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(s.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void blockSession(s)}
                      >
                        Block
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-base font-semibold">Find visit by ticket</h3>
        <p className="text-sm text-muted-foreground">
          Each visit gets a unique ticket number (e.g. #1042). Search any visit —
          open or closed — then open it in Workspace.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="ticket-lookup">Ticket number</Label>
            <Input
              id="ticket-lookup"
              className="min-w-[10rem] font-mono"
              placeholder="#1042"
              value={ticketLookupInput}
              onChange={(e) => setTicketLookupInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lookupTicket();
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !ticketLookupInput.trim()}
            onClick={() => void lookupTicket()}
          >
            Find
          </Button>
        </div>
        {ticketLookupErr ? (
          <p className="text-sm text-destructive" role="alert">
            {ticketLookupErr}
          </p>
        ) : null}
        {ticketLookupResult ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-mono text-base font-semibold text-primary">
              {formatVisitTicketNumber(ticketLookupResult.ticketNumber)}
            </p>
            <p className="mt-1 font-medium">{ticketLookupResult.patientName}</p>
            <p className="text-muted-foreground">
              {new Date(ticketLookupResult.visitDate).toLocaleString()} ·{" "}
              {ticketLookupResult.status === "OPEN" ? "Open" : "Closed"}
            </p>
            {ticketLookupResult.contactNumber ? (
              <p className="text-xs text-muted-foreground">
                {ticketLookupResult.contactNumber}
              </p>
            ) : null}
            <Button type="button" size="sm" className="mt-3" asChild>
              <a
                href={`/workspace${workspaceQuery(
                  ticketLookupResult.patientId,
                  ticketLookupResult.visitId,
                )}`}
              >
                Open in Workspace
              </a>
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-base font-semibold">{t("visit.reopenVisit")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("visit.reopenHint")} You can paste the visit ID or a ticket number
          (e.g. #1042).
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="reopen-id">{t("dev.visitId")}</Label>
            <Input
              id="reopen-id"
              className="min-w-[16rem] font-mono text-sm"
              placeholder="Visit ID or #1042"
              value={reopenVisitId}
              onChange={(e) => setReopenVisitId(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={busy || !reopenVisitId.trim()}
            onClick={() => void reopenVisit()}
          >
            {t("visit.reopenConfirm")}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">{t("dev.audit")}</h3>
        <div className="max-h-80 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(a.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">{a.actorEmail ?? "—"}</TableCell>
                  <TableCell className="text-xs">{a.action}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs">
                    {a.summary}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => void deleteAudit(a.id)}
                    >
                      {t("dev.deleteAudit")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
