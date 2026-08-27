import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";

export function AdminGateUnlock(props: { returnTo: string }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    void (async () => {
      const setupRes = await api<{ needsSetup: boolean }>(
        "/api/admin/bootstrap-admin-ii",
      );
      if (setupRes.ok && setupRes.data.needsSetup) {
        window.location.href = "/admin/setup-admin-ii";
        return;
      }

      const res = await api<{
        configured: boolean;
        unlocked: boolean;
      }>("/api/admin/gate/status");
      if (res.ok) {
        if (res.data.unlocked) {
          window.location.href = props.returnTo || "/admin";
          return;
        }
        setNotConfigured(!res.data.configured);
      }
    })();
  }, [props.returnTo]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await api("/api/admin/gate/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((res.data as { error?: string }).error ?? "Could not verify passcode");
      return;
    }
    window.location.href = props.returnTo || "/admin";
  }

  if (notConfigured) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/30">
        <h2 className="text-lg font-semibold">Passcode not set up yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The person with <strong>Admin II</strong> access should open{" "}
          <strong>Administration → Advanced tools</strong> and set the
          administration passcode. Then you can enter it here.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <a href="/patients">Back to patients</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Enter administration passcode</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin II set this code. It is required to open Administration and Change
          history. It stays valid for about 8 hours on this device.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        {err ? (
          <p className="text-sm text-destructive" role="alert">
            {err}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="admin-gate-code">Passcode</Label>
          <Input
            id="admin-gate-code"
            type="password"
            autoComplete="off"
            className="font-mono"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || code.length < 4}>
            {busy ? "Checking…" : "Continue"}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <a href="/patients">Cancel</a>
          </Button>
        </div>
      </form>
    </div>
  );
}
