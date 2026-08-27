import { useEffect, useState } from "react";
import { AdminMedicineCatalog } from "@/components/AdminMedicineCatalog";
import { AdminApprovalRequests } from "@/components/AdminApprovalRequests";
import { AdminAdvancedTools } from "@/components/AdminDevTools";
import { AdminPendingBadge } from "@/components/AdminPendingBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { CatalogItem, Role, UserRow } from "@/lib/clinical-types";
import { formatCents, pesoStringToCents } from "@/lib/money";
import { Plus, Trash2 } from "lucide-react";

type PricingMode = CatalogItem["pricingMode"];

function centsToDecimalInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function roleLabel(role: Role): string {
  if (role === "ADMIN_I") return "Admin I";
  if (role === "ADMIN_II") return "Admin II";
  return role;
}

export function AdminHub(props: { initialRole: Role }) {
  const isAdminI = props.initialRole === "ADMIN_I";
  const isAdminII = props.initialRole === "ADMIN_II";
  const [adminCatalog, setAdminCatalog] = useState<CatalogItem[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [newCatalog, setNewCatalog] = useState({
    code: "",
    name: "",
    pricingMode: "FIXED" as PricingMode,
    unitPeso: "",
    levelRows: [{ label: "", peso: "" }],
  });
  const [levelEditById, setLevelEditById] = useState<
    Record<string, { id?: string; label: string; peso: string }[]>
  >({});
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    role: "USER" as Role,
  });
  const [requestAdminII, setRequestAdminII] = useState(false);
  const [adminIISlot, setAdminIISlot] = useState<{
    hasAdminII: boolean;
    pendingRequestCount: number;
    canRequestAdminII: boolean;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<"main" | "requests" | "advanced">(
    props.initialRole === "ADMIN_II" ? "advanced" : "main",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      if (window.location.hash === "#requests") setAdminTab("requests");
      else if (window.location.hash === "#advanced") setAdminTab("advanced");
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("clinicalhub:correction-requests", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("clinicalhub:correction-requests", sync);
    };
  }, []);

  async function load() {
    setErr(null);
    const [cRes, uRes] = await Promise.all([
      api<{ catalog: CatalogItem[] }>("/api/catalog?all=1"),
      api<{
        users: UserRow[];
        currentUserId: string;
        adminIISlot: {
          hasAdminII: boolean;
          pendingRequestCount: number;
          canRequestAdminII: boolean;
        };
      }>("/api/users"),
    ]);
    if (!cRes.ok || !uRes.ok) {
      setErr("Could not load admin data");
      return;
    }
    setAdminCatalog(cRes.data.catalog);
    setAdminIISlot(uRes.data.adminIISlot);
    const nextLevels: Record<string, { id?: string; label: string; peso: string }[]> =
      {};
    for (const c of cRes.data.catalog) {
      if (c.pricingMode === "BY_LEVEL") {
        nextLevels[c.id] = c.levelPrices.map((t) => ({
          id: t.id,
          label: t.label,
          peso: centsToDecimalInput(t.unitPriceCents),
        }));
      }
    }
    setLevelEditById(nextLevels);
    setCurrentUserId(uRes.data.currentUserId);
    setUsers(
      uRes.data.users.map((u) => ({
        ...u,
        createdAt:
          typeof u.createdAt === "string"
            ? u.createdAt
            : new Date(u.createdAt as unknown as number).toISOString(),
      })),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleCatalogActive(item: CatalogItem) {
    const { ok } = await api(`/api/catalog/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !item.active }),
    });
    if (!ok) {
      setErr("Could not update catalog item");
      return;
    }
    await load();
  }

  async function saveCatalogLevels(item: CatalogItem) {
    if (item.pricingMode !== "BY_LEVEL") return;
    const rows = levelEditById[item.id] ?? [];
    const levelPrices: {
      id?: string;
      label: string;
      unitPriceCents: number;
    }[] = [];
    for (const r of rows.filter((x) => x.label.trim())) {
      const unitPriceCents = pesoStringToCents(r.peso);
      if (unitPriceCents === null) {
        setErr(`Enter a valid PHP price for level "${r.label}".`);
        return;
      }
      levelPrices.push({
        ...(r.id ? { id: r.id } : {}),
        label: r.label.trim(),
        unitPriceCents,
      });
    }
    if (levelPrices.length === 0) {
      setErr("Add at least one level with a label and price.");
      return;
    }
    const { ok } = await api(`/api/catalog/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ levelPrices }),
    });
    if (!ok) {
      setErr("Could not update level prices");
      return;
    }
    await load();
  }

  async function deleteCatalogItem(item: CatalogItem) {
    if (
      !window.confirm(
        `Delete "${item.name}" from the catalog? This cannot be undone if no visits use it.`,
      )
    ) {
      return;
    }
    setDeletingId(item.id);
    setErr(null);
    const { ok, data } = await api<{ error?: string }>(
      `/api/catalog/${item.id}`,
      { method: "DELETE" },
    );
    setDeletingId(null);
    if (!ok) {
      setErr(
        data.error ??
          "Could not delete (it may still be used on a visit). Deactivate instead.",
      );
      return;
    }
    await load();
  }

  async function addCatalogItem() {
    if (!newCatalog.name.trim()) {
      setErr("Enter a procedure name.");
      return;
    }
    if (
      newCatalog.pricingMode === "FIXED" ||
      newCatalog.pricingMode === "PER_UNIT"
    ) {
      const cents = pesoStringToCents(newCatalog.unitPeso);
      if (cents === null) {
        setErr(
          newCatalog.pricingMode === "PER_UNIT"
            ? "Enter a valid price per unit (PHP)."
            : "Enter a valid fixed price (PHP).",
        );
        return;
      }
      const { ok } = await api("/api/catalog", {
        method: "POST",
        body: JSON.stringify({
          code: newCatalog.code.trim() || null,
          name: newCatalog.name.trim(),
          pricingMode: newCatalog.pricingMode,
          unitPriceCents: cents,
        }),
      });
      if (!ok) {
        setErr("Could not add catalog item");
        return;
      }
    } else if (newCatalog.pricingMode === "MANUAL") {
      const { ok } = await api("/api/catalog", {
        method: "POST",
        body: JSON.stringify({
          code: newCatalog.code.trim() || null,
          name: newCatalog.name.trim(),
          pricingMode: "MANUAL",
        }),
      });
      if (!ok) {
        setErr("Could not add catalog item");
        return;
      }
    } else {
      const levelPrices: { label: string; unitPriceCents: number }[] = [];
      for (const r of newCatalog.levelRows.filter((x) => x.label.trim())) {
        const unitPriceCents = pesoStringToCents(r.peso);
        if (unitPriceCents === null) {
          setErr(`Enter a valid PHP price for level "${r.label}".`);
          return;
        }
        levelPrices.push({ label: r.label.trim(), unitPriceCents });
      }
      if (levelPrices.length === 0) {
        setErr(
          "Add at least one level (label + PHP price) for by-level pricing.",
        );
        return;
      }
      const { ok } = await api("/api/catalog", {
        method: "POST",
        body: JSON.stringify({
          code: newCatalog.code.trim() || null,
          name: newCatalog.name.trim(),
          pricingMode: "BY_LEVEL",
          levelPrices,
        }),
      });
      if (!ok) {
        setErr("Could not add catalog item");
        return;
      }
    }
    setNewCatalog({
      code: "",
      name: "",
      pricingMode: "FIXED",
      unitPeso: "",
      levelRows: [{ label: "", peso: "" }],
    });
    await load();
  }

  async function resetUserPassword(user: UserRow) {
    const next = window.prompt(
      `New password for ${user.email} (min 8 characters):`,
    );
    if (!next) return;
    if (next.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    setResettingUserId(user.id);
    setErr(null);
    const { ok, data } = await api<{ error?: string }>(`/api/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ newPassword: next }),
    });
    setResettingUserId(null);
    if (!ok) {
      setErr(data.error ?? "Could not reset password");
      return;
    }
    await load();
  }

  async function deleteUser(user: UserRow) {
    if (
      !window.confirm(
        `Delete account ${user.email}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingUserId(user.id);
    setErr(null);
    const { ok, data } = await api<{ error?: string }>(`/api/users/${user.id}`, {
      method: "DELETE",
    });
    setDeletingUserId(null);
    if (!ok) {
      setErr(data.error ?? "Could not delete user");
      return;
    }
    await load();
  }

  async function addUser() {
    const { ok, data } = await api<{ user: UserRow; adminIIRequested?: boolean }>(
      "/api/users",
      {
        method: "POST",
        body: JSON.stringify({ ...newUser, requestAdminII }),
      },
    );
    if (!ok) {
      setErr((data as { error?: string }).error ?? "Could not create user");
      return;
    }
    setNewUser({ email: "", password: "", role: "USER" });
    setRequestAdminII(false);
    await load();
    if (requestAdminII) {
      setAdminTab("requests");
      if (typeof window !== "undefined") window.location.hash = "requests";
    }
  }

  function pricingSummary(c: CatalogItem): string {
    if (c.pricingMode === "MANUAL") return "Manual (visit: teeth + line price)";
    if (c.pricingMode === "BY_LEVEL") {
      if (c.levelPrices.length === 0) return "By level (no tiers)";
      return c.levelPrices
        .map((t) => `${t.label}: ${formatCents(t.unitPriceCents)}`)
        .join(" · ");
    }
    if (c.pricingMode === "PER_UNIT") {
      return `${formatCents(c.unitPriceCents)} per unit (qty on visit)`;
    }
    return formatCents(c.unitPriceCents);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {isAdminI ? (
          <Button
            type="button"
            variant={adminTab === "main" ? "default" : "secondary"}
            onClick={() => {
              setAdminTab("main");
              if (typeof window !== "undefined") window.location.hash = "";
            }}
          >
            Catalog &amp; users
          </Button>
        ) : null}
        {isAdminI ? (
          <Button
            type="button"
            variant={adminTab === "requests" ? "default" : "secondary"}
            className={
              adminTab === "requests" ? "ring-2 ring-highlight/80" : undefined
            }
            onClick={() => {
              setAdminTab("requests");
              if (typeof window !== "undefined")
                window.location.hash = "requests";
            }}
          >
            Approvals
            <AdminPendingBadge />
          </Button>
        ) : null}
        {isAdminII ? (
          <Button
            type="button"
            variant={adminTab === "advanced" ? "default" : "secondary"}
            onClick={() => {
              setAdminTab("advanced");
              if (typeof window !== "undefined")
                window.location.hash = "advanced";
            }}
          >
            Advanced tools
          </Button>
        ) : null}
      </div>

      {err && adminTab === "main" ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {adminTab === "requests" && isAdminI ? (
        <AdminApprovalRequests />
      ) : adminTab === "advanced" && isAdminII ? (
        <AdminAdvancedTools />
      ) : isAdminI ? (
        <>
      <section>
        <h2 className="mb-3 text-lg font-medium">Procedure catalog</h2>
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Pricing</span>
            <select
              className="h-10 rounded-md border px-2 text-sm"
              value={newCatalog.pricingMode}
              onChange={(e) =>
                setNewCatalog((s) => ({
                  ...s,
                  pricingMode: e.target.value as PricingMode,
                }))
              }
            >
              <option value="FIXED">Fixed (flat fee per line)</option>
              <option value="PER_UNIT">
                Per unit / qty (price × units on visit)
              </option>
              <option value="MANUAL">
                Manual (tooth #s + line price on visit; not × qty)
              </option>
              <option value="BY_LEVEL">
                By level (tier price on visit; one line per submit)
              </option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Code (optional)"
              value={newCatalog.code}
              onChange={(e) =>
                setNewCatalog((s) => ({ ...s, code: e.target.value }))
              }
              className="w-32"
            />
            <Input
              placeholder="Name"
              value={newCatalog.name}
              onChange={(e) =>
                setNewCatalog((s) => ({ ...s, name: e.target.value }))
              }
              className="w-48"
            />
            {newCatalog.pricingMode === "FIXED" ||
            newCatalog.pricingMode === "PER_UNIT" ? (
              <Input
                placeholder={
                  newCatalog.pricingMode === "PER_UNIT"
                    ? "Price per unit (PHP)"
                    : "Fixed price (PHP)"
                }
                value={newCatalog.unitPeso}
                onChange={(e) =>
                  setNewCatalog((s) => ({ ...s, unitPeso: e.target.value }))
                }
                className="w-36"
              />
            ) : null}
            <Button type="button" onClick={() => void addCatalogItem()}>
              Add
            </Button>
          </div>
          {newCatalog.pricingMode === "BY_LEVEL" ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Levels (label + PHP each)</p>
              {newCatalog.levelRows.map((row, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Level label (e.g. Simple)"
                    value={row.label}
                    onChange={(e) =>
                      setNewCatalog((s) => {
                        const next = [...s.levelRows];
                        next[idx] = { ...next[idx], label: e.target.value };
                        return { ...s, levelRows: next };
                      })
                    }
                    className="w-40"
                  />
                  <Input
                    placeholder="Price (PHP)"
                    value={row.peso}
                    onChange={(e) =>
                      setNewCatalog((s) => {
                        const next = [...s.levelRows];
                        next[idx] = { ...next[idx], peso: e.target.value };
                        return { ...s, levelRows: next };
                      })
                    }
                    className="w-28"
                  />
                  {newCatalog.levelRows.length > 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      aria-label="Remove level row"
                      onClick={() =>
                        setNewCatalog((s) => ({
                          ...s,
                          levelRows: s.levelRows.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setNewCatalog((s) => ({
                    ...s,
                    levelRows: [...s.levelRows, { label: "", peso: "" }],
                  }))
                }
              >
                <Plus className="mr-1 inline h-3.5 w-3.5" />
                Add level
              </Button>
            </div>
          ) : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="min-w-[12rem]">Pricing</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adminCatalog.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="align-top font-medium">{c.name}</TableCell>
                <TableCell className="align-top text-sm">
                  {c.pricingMode === "FIXED"
                    ? "Fixed"
                    : c.pricingMode === "PER_UNIT"
                      ? "Per unit"
                      : c.pricingMode === "MANUAL"
                        ? "Manual"
                        : "By level"}
                  {c.active ? null : (
                    <span className="mt-1 block text-xs text-destructive">
                      Inactive
                    </span>
                  )}
                </TableCell>
                <TableCell className="align-top text-sm text-muted-foreground">
                  <div>{pricingSummary(c)}</div>
                  {c.pricingMode === "BY_LEVEL" ? (
                    <div className="mt-2 space-y-1 rounded border bg-muted/30 p-2">
                      {(levelEditById[c.id] ?? []).map((row, idx) => (
                        <div key={idx} className="flex flex-wrap gap-1">
                          <Input
                            className="h-8 w-28 text-xs"
                            placeholder="Label"
                            value={row.label}
                            onChange={(e) =>
                              setLevelEditById((m) => {
                                const cur = [...(m[c.id] ?? [])];
                                cur[idx] = {
                                  ...cur[idx],
                                  label: e.target.value,
                                };
                                return { ...m, [c.id]: cur };
                              })
                            }
                          />
                          <Input
                            className="h-8 w-24 text-xs"
                            placeholder="PHP"
                            value={row.peso}
                            onChange={(e) =>
                              setLevelEditById((m) => {
                                const cur = [...(m[c.id] ?? [])];
                                cur[idx] = { ...cur[idx], peso: e.target.value };
                                return { ...m, [c.id]: cur };
                              })
                            }
                          />
                          {(levelEditById[c.id] ?? []).length > 1 ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() =>
                                setLevelEditById((m) => ({
                                  ...m,
                                  [c.id]: (m[c.id] ?? []).filter(
                                    (_, i) => i !== idx,
                                  ),
                                }))
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          ) : null}
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          onClick={() =>
                            setLevelEditById((m) => ({
                              ...m,
                              [c.id]: [...(m[c.id] ?? []), { label: "", peso: "" }],
                            }))
                          }
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Level
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          onClick={() => void saveCatalogLevels(c)}
                        >
                          Save levels
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="align-top text-right">
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void toggleCatalogActive(c)}
                    >
                      {c.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={deletingId === c.id}
                      onClick={() => void deleteCatalogItem(c)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <AdminMedicineCatalog />

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Users</h2>
          <a
            href="/admin/history"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            View change history
          </a>
        </div>
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Email"
              value={newUser.email}
              onChange={(e) =>
                setNewUser((s) => ({ ...s, email: e.target.value }))
              }
              className="w-48"
            />
            <Input
              type="password"
              placeholder="Password (min 8)"
              value={newUser.password}
              onChange={(e) =>
                setNewUser((s) => ({ ...s, password: e.target.value }))
              }
              className="w-40"
            />
            <select
              className="h-10 rounded-md border px-2 text-sm"
              value={newUser.role}
              onChange={(e) =>
                setNewUser((s) => ({ ...s, role: e.target.value as Role }))
              }
            >
              <option value="USER">USER</option>
              <option value="TRAINEE">TRAINEE</option>
            </select>
            <Button type="button" onClick={() => void addUser()}>
              Add user
            </Button>
          </div>
          {adminIISlot?.hasAdminII ? (
            <p className="text-sm text-muted-foreground">
              An Admin II account already exists. You cannot assign another.
            </p>
          ) : adminIISlot?.pendingRequestCount ? (
            <p className="text-sm text-muted-foreground">
              An Admin II request is pending under Approvals. Approve or reject
              it before requesting another.
            </p>
          ) : (
            <label className="flex max-w-lg cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requestAdminII}
                onChange={(e) => setRequestAdminII(e.target.checked)}
                className="h-4 w-4 rounded border"
              />
              Request Admin II access (approve once under Approvals — only one
              Admin II allowed)
            </label>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.email}</TableCell>
                <TableCell className="font-medium">{roleLabel(u.role)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={resettingUserId === u.id}
                      onClick={() => void resetUserPassword(u)}
                    >
                      Reset password
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={
                        deletingUserId === u.id || u.id === currentUserId
                      }
                      onClick={() => void deleteUser(u)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
        </>
      ) : null}
    </div>
  );
}
