import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
          {catalog.map((item) => (
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
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
