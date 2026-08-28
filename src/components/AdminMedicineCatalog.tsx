import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
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
import type { MedicineCatalogItem } from "@/lib/medicine-catalog-dto";

export function AdminMedicineCatalog() {
  const [catalog, setCatalog] = useState<MedicineCatalogItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    code: "",
    name: "",
    defaultDose: "",
    defaultInstructions: "",
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    code: "",
    name: "",
    defaultDose: "",
    defaultInstructions: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const { ok, data } = await api<{ catalog: MedicineCatalogItem[] }>(
      "/api/medicine-catalog?all=1",
    );
    if (!ok) {
      setErr(
        (data as { error?: string }).error ?? "Could not load medicine catalog",
      );
      return;
    }
    setCatalog(data.catalog);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addItem() {
    if (!newItem.name.trim()) {
      setErr("Medicine name is required.");
      return;
    }
    setErr(null);
    const { ok, data } = await api<{ item: MedicineCatalogItem }>(
      "/api/medicine-catalog",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newItem.code.trim() || null,
          name: newItem.name.trim(),
          defaultDose: newItem.defaultDose.trim() || null,
          defaultInstructions: newItem.defaultInstructions.trim() || null,
          active: true,
        }),
      },
    );
    if (!ok) {
      setErr((data as { error?: string }).error ?? "Could not add medicine");
      return;
    }
    setNewItem({
      code: "",
      name: "",
      defaultDose: "",
      defaultInstructions: "",
    });
    await load();
  }

  function startEdit(item: MedicineCatalogItem) {
    setErr(null);
    setEditingId(item.id);
    setEditDraft({
      code: item.code ?? "",
      name: item.name,
      defaultDose: item.defaultDose ?? "",
      defaultInstructions: item.defaultInstructions ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    if (!editDraft.name.trim()) {
      setErr("Medicine name is required.");
      return;
    }
    setSavingEdit(true);
    setErr(null);
    const { ok, data } = await api<{ item: MedicineCatalogItem }>(
      `/api/medicine-catalog/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: editDraft.code.trim() || null,
          name: editDraft.name.trim(),
          defaultDose: editDraft.defaultDose.trim() || null,
          defaultInstructions: editDraft.defaultInstructions.trim() || null,
        }),
      },
    );
    setSavingEdit(false);
    if (!ok) {
      setErr((data as { error?: string }).error ?? "Could not save changes");
      return;
    }
    setEditingId(null);
    await load();
  }

  async function toggleActive(item: MedicineCatalogItem) {
    setErr(null);
    const { ok, data } = await api<{ item: MedicineCatalogItem }>(
      `/api/medicine-catalog/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      },
    );
    if (!ok) {
      setErr((data as { error?: string }).error ?? "Could not update medicine");
      return;
    }
    await load();
  }

  async function removeItem(id: string) {
    setDeletingId(id);
    setErr(null);
    const { ok, data } = await api<{ ok?: boolean }>(
      `/api/medicine-catalog/${id}`,
      { method: "DELETE" },
    );
    setDeletingId(null);
    if (!ok) {
      setErr(
        (data as { error?: string }).error ??
          "Could not remove medicine. Deactivate it instead if it was used on a prescription.",
      );
      return;
    }
    await load();
  }

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-lg font-medium">Medicine catalog</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Medicines listed here appear in the prescription dropdown. Admin I only.
      </p>
      {err ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Code (optional)"
          value={newItem.code}
          onChange={(e) =>
            setNewItem((s) => ({ ...s, code: e.target.value }))
          }
        />
        <Input
          placeholder="Medicine name"
          value={newItem.name}
          onChange={(e) =>
            setNewItem((s) => ({ ...s, name: e.target.value }))
          }
        />
        <Input
          placeholder="Default dose (e.g. 500 mg tablet)"
          value={newItem.defaultDose}
          onChange={(e) =>
            setNewItem((s) => ({ ...s, defaultDose: e.target.value }))
          }
        />
        <Input
          placeholder="Default instructions"
          value={newItem.defaultInstructions}
          onChange={(e) =>
            setNewItem((s) => ({
              ...s,
              defaultInstructions: e.target.value,
            }))
          }
        />
      </div>
      <Button type="button" className="mb-4" onClick={() => void addItem()}>
        <Plus className="mr-1 h-4 w-4" />
        Add medicine
      </Button>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Default dose</TableHead>
            <TableHead>Default instructions</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {catalog.map((item) =>
            editingId === item.id ? (
              <TableRow key={item.id}>
                <TableCell className="align-top">
                  <Input
                    value={editDraft.name}
                    aria-label="Medicine name"
                    placeholder="Medicine name"
                    onChange={(e) =>
                      setEditDraft((s) => ({ ...s, name: e.target.value }))
                    }
                  />
                  <Input
                    className="mt-1"
                    value={editDraft.code}
                    aria-label="Code"
                    placeholder="Code (optional)"
                    onChange={(e) =>
                      setEditDraft((s) => ({ ...s, code: e.target.value }))
                    }
                  />
                </TableCell>
                <TableCell className="align-top">
                  <Input
                    value={editDraft.defaultDose}
                    aria-label="Default dose"
                    placeholder="e.g. 500 mg tablet"
                    onChange={(e) =>
                      setEditDraft((s) => ({
                        ...s,
                        defaultDose: e.target.value,
                      }))
                    }
                  />
                </TableCell>
                <TableCell className="align-top">
                  <Input
                    value={editDraft.defaultInstructions}
                    aria-label="Default instructions"
                    placeholder="e.g. 1 tablet every 8 hours"
                    onChange={(e) =>
                      setEditDraft((s) => ({
                        ...s,
                        defaultInstructions: e.target.value,
                      }))
                    }
                  />
                </TableCell>
                <TableCell className="align-top text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingEdit}
                      onClick={() => void saveEdit(item.id)}
                    >
                      {savingEdit ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel edit"
                      disabled={savingEdit}
                      onClick={cancelEdit}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={item.id}>
                <TableCell className="align-top font-medium">
                  {item.name}
                  {item.code ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.code}
                    </span>
                  ) : null}
                  {!item.active ? (
                    <span className="mt-1 block text-xs text-destructive">
                      Inactive
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="align-top text-sm text-muted-foreground">
                  {item.defaultDose || "—"}
                </TableCell>
                <TableCell className="align-top text-sm text-muted-foreground">
                  {item.defaultInstructions || "—"}
                </TableCell>
                <TableCell className="align-top text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={editingId !== null}
                      onClick={() => startEdit(item)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void toggleActive(item)}
                    >
                      {item.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      disabled={deletingId === item.id}
                      aria-label={`Remove ${item.name}`}
                      onClick={() => void removeItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </section>
  );
}
