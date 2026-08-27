import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { AdminICandidate } from "@/lib/admin-ii-bootstrap";

export function AdminIISetup() {
  const [candidates, setCandidates] = useState<AdminICandidate[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await api<{
        needsSetup: boolean;
        candidates: AdminICandidate[];
        currentUserId: string | null;
      }>("/api/admin/bootstrap-admin-ii");
      setLoading(false);
      if (!res.ok) {
        setErr("Could not load setup options.");
        return;
      }
      if (!res.data.needsSetup) {
        window.location.href = "/admin";
        return;
      }
      setCandidates(res.data.candidates);
      setCurrentUserId(res.data.currentUserId);
      const defaultId =
        res.data.candidates.length === 1
          ? res.data.candidates[0].id
          : (res.data.currentUserId ??
            res.data.candidates[0]?.id ??
            null);
      setSelectedId(defaultId);
    })();
  }, []);

  async function onConfirm() {
    if (!selectedId) {
      setErr("Select who will be Admin II.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await api<{
      ok?: boolean;
      email?: string;
      promotedSelf?: boolean;
      error?: string;
    }>("/api/admin/bootstrap-admin-ii", {
      method: "POST",
      body: JSON.stringify({ targetUserId: selectedId }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data.error ?? "Could not complete setup.");
      return;
    }
    if (res.data.promotedSelf) {
      window.location.href = "/admin#advanced";
      return;
    }
    window.location.href = "/patients";
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading setup…</p>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold">No Admin I accounts found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create at least one Admin I account before designating Admin II.
        </p>
        <Button asChild variant="secondary" className="mt-4">
          <a href="/patients">Back to patients</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 rounded-lg border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Choose Admin II</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No Admin II account exists yet. Before using Administration, pick which{" "}
          <strong>Admin I</strong> will become <strong>Admin II</strong> (only one
          allowed). That person can then set the administration passcode under{" "}
          <strong>Advanced tools</strong>.
        </p>
      </div>

      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Admin I accounts</legend>
        {candidates.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              name="admin-ii-candidate"
              className="h-4 w-4"
              checked={selectedId === c.id}
              onChange={() => setSelectedId(c.id)}
            />
            <span className="text-sm">
              {c.email}
              {c.id === currentUserId ? (
                <span className="ml-1.5 text-muted-foreground">(you)</span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || !selectedId}
          onClick={() => void onConfirm()}
        >
          {busy ? "Saving…" : "Confirm Admin II"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href="/patients">Cancel</a>
        </Button>
      </div>
    </div>
  );
}
