import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { Patient, Role } from "@/lib/clinical-types";
import { toManilaDateKey } from "@/lib/manila-date";
import {
  formatFileSize,
  MAX_DOCUMENT_BYTES,
  type PatientDocumentSummary,
} from "@/lib/patient-document-dto";

const KIND_OPTIONS = [
  { value: "XRAY", label: "X-ray" },
  { value: "PHOTO", label: "Clinical photo" },
  { value: "DOCUMENT", label: "Scanned document" },
  { value: "OTHER", label: "Other" },
] as const;

const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,application/pdf";

function kindLabel(kind: string): string {
  return KIND_OPTIONS.find((k) => k.value === kind)?.label ?? kind;
}

function formatUploadedAt(iso: string): string {
  try {
    return toManilaDateKey(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function PatientDocuments(props: {
  patientId: string | null;
  visitId?: string | null;
  initialRole: Role;
  patient?: Patient | null;
}) {
  const canUpload =
    props.initialRole === "ADMIN_I" ||
    props.initialRole === "ADMIN_II" ||
    props.initialRole === "USER";
  const canDelete =
    props.initialRole === "ADMIN_I" || props.initialRole === "ADMIN_II";

  const [documents, setDocuments] = useState<PatientDocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [kind, setKind] = useState<string>("XRAY");
  const [caption, setCaption] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  const [preview, setPreview] = useState<PatientDocumentSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!props.patientId) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    const { ok, data } = await api<{ documents: PatientDocumentSummary[] }>(
      `/api/patients/${props.patientId}/documents`,
    );
    setLoading(false);
    if (!ok) {
      setErr(
        (data as { error?: string }).error ?? "Could not load patient files",
      );
      return;
    }
    setErr(null);
    setDocuments(data.documents);
  }, [props.patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      filter === "ALL"
        ? documents
        : documents.filter((doc) => doc.kind === filter),
    [documents, filter],
  );

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0 || !props.patientId) return;

    const oversized = list.find((f) => f.size > MAX_DOCUMENT_BYTES);
    if (oversized) {
      setErr(
        `"${oversized.name}" is ${formatFileSize(oversized.size)}. The limit is ${formatFileSize(MAX_DOCUMENT_BYTES)} per file.`,
      );
      return;
    }

    setUploading(true);
    setErr(null);
    setNotice(null);

    let uploaded = 0;
    for (const file of list) {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      if (caption.trim()) form.append("caption", caption.trim());
      if (props.visitId) form.append("visitId", props.visitId);

      const { ok, data } = await api<{ error?: string }>(
        `/api/patients/${props.patientId}/documents`,
        { method: "POST", body: form },
      );
      if (!ok) {
        setErr(data.error ?? `Could not upload "${file.name}"`);
        break;
      }
      uploaded += 1;
    }

    setUploading(false);
    if (uploaded > 0) {
      setCaption("");
      setNotice(
        uploaded === 1 ? "1 file uploaded." : `${uploaded} files uploaded.`,
      );
      await load();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function saveCaption(doc: PatientDocumentSummary, next: string) {
    const { ok, data } = await api<{ error?: string }>(
      `/api/patient-documents/${doc.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ caption: next.trim() || null }),
      },
    );
    if (!ok) {
      setErr(data.error ?? "Could not save the caption");
      return;
    }
    setPreview((p) => (p ? { ...p, caption: next.trim() || null } : p));
    await load();
  }

  async function removeDocument(doc: PatientDocumentSummary) {
    if (
      !window.confirm(
        `Delete "${doc.fileName}"? This permanently removes it from the patient record.`,
      )
    ) {
      return;
    }
    setDeletingId(doc.id);
    const { ok, data } = await api<{ error?: string }>(
      `/api/patient-documents/${doc.id}`,
      { method: "DELETE" },
    );
    setDeletingId(null);
    if (!ok) {
      setErr(data.error ?? "Could not delete this file");
      return;
    }
    setPreview(null);
    await load();
  }

  if (!props.patientId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a patient to view or upload files.
      </p>
    );
  }

  const patientLabel = props.patient
    ? `${props.patient.lastName}, ${props.patient.firstName}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Patient files</h1>
        <p className="text-sm text-muted-foreground">
          {patientLabel ? `Patient: ${patientLabel} · ` : ""}
          X-rays, clinical photos, and scanned documents. Up to{" "}
          {formatFileSize(MAX_DOCUMENT_BYTES)} per file.
        </p>
      </div>

      {err ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {err}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {canUpload ? (
        <section className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs" htmlFor="doc-kind">
                File type
              </Label>
              <select
                id="doc-kind"
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs" htmlFor="doc-caption">
                Label / note (optional)
              </Label>
              <Input
                id="doc-caption"
                className="mt-1"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Panoramic, upper left molar"
              />
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files?.length) {
                void uploadFiles(e.dataTransfer.files);
              }
            }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 bg-muted/20"
            }`}
          >
            {uploading ? (
              <Loader2 className="mb-2 h-6 w-6 animate-spin text-primary" />
            ) : (
              <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {uploading ? "Uploading…" : "Drag files here, or choose from your device"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG, WEBP, GIF, BMP, TIFF, or PDF
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void uploadFiles(e.target.files);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose files
            </Button>
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">
            Files{documents.length > 0 ? ` (${documents.length})` : ""}
          </h2>
          <div className="flex flex-wrap gap-1">
            {[{ value: "ALL", label: "All" }, ...KIND_OPTIONS].map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={filter === option.value ? "default" : "secondary"}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {documents.length === 0
              ? "No files uploaded for this patient yet."
              : "No files match this filter."}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((doc) => (
              <li
                key={doc.id}
                className="group overflow-hidden rounded-lg border bg-card shadow-sm"
              >
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => setPreview(doc)}
                  aria-label={`Open ${doc.fileName}`}
                >
                  <span className="flex aspect-square items-center justify-center overflow-hidden bg-muted/40">
                    {doc.isImage ? (
                      <img
                        src={doc.fileUrl}
                        alt={doc.caption ?? doc.fileName}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <FileText className="h-10 w-10 text-muted-foreground" />
                    )}
                  </span>
                </button>
                <div className="space-y-1 p-2">
                  <div className="flex items-center justify-between gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {kindLabel(doc.kind)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatUploadedAt(doc.createdAt)}
                    </span>
                  </div>
                  <p className="truncate text-xs font-medium" title={doc.fileName}>
                    {doc.caption || doc.fileName}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatFileSize(doc.sizeBytes)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-base">
                  {preview.caption || preview.fileName}
                </DialogTitle>
                <DialogDescription>
                  {kindLabel(preview.kind)} · {formatFileSize(preview.sizeBytes)} ·
                  uploaded {formatUploadedAt(preview.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-center rounded-md border bg-muted/30 p-2">
                {preview.isImage ? (
                  <img
                    src={preview.fileUrl}
                    alt={preview.caption ?? preview.fileName}
                    className="max-h-[55vh] w-auto object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      PDF preview opens in a new tab.
                    </p>
                  </div>
                )}
              </div>

              {canUpload ? (
                <div>
                  <Label className="text-xs" htmlFor="preview-caption">
                    Label / note
                  </Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      id="preview-caption"
                      defaultValue={preview.caption ?? ""}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void saveCaption(preview, e.currentTarget.value);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={(e) => {
                        const input = (
                          e.currentTarget.parentElement as HTMLElement
                        ).querySelector("input");
                        if (input) void saveCaption(preview, input.value);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" asChild>
                  <a href={preview.fileUrl} target="_blank" rel="noreferrer">
                    <ImageIcon className="mr-1 h-4 w-4" />
                    Open full size
                  </a>
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href={`${preview.fileUrl}?download=1`}>
                    <Download className="mr-1 h-4 w-4" />
                    Download
                  </a>
                </Button>
                {canDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    disabled={deletingId === preview.id}
                    onClick={() => void removeDocument(preview)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setPreview(null)}
                >
                  <X className="mr-1 h-4 w-4" />
                  Close
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
