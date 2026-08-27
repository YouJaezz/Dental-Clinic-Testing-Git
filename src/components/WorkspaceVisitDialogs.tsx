import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Role, Summary, Visit } from "@/lib/clinical-types";
import type { VisitDeletePreview } from "@/lib/visit-delete";
import { formatCents } from "@/lib/money";
import { useLocale } from "@/lib/use-locale";

function formatVisitWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function VisitStartConfirmDialog(props: {
  open: boolean;
  openVisits: Visit[];
  summary: Summary | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseExistingAndStart: () => void;
}) {
  const { t } = useLocale();
  const primary = props.openVisits[0];
  const procedureCount = props.summary?.chargeLines.length ?? 0;
  const hasBalance = (props.summary?.balanceCents ?? 0) > 0;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-amber-600"
              aria-hidden
            />
            {t("visit.startBlockedTitle")}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-left text-sm text-muted-foreground">
              <p className="text-foreground">{t("visit.startBlockedLead")}</p>

              {primary ? (
                <div className="rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-medium text-foreground">
                    {t("visit.startBlockedCurrent")}
                    {props.openVisits.length > 1
                      ? t("visit.startBlockedAndMore", {
                          count: props.openVisits.length - 1,
                        })
                      : ""}
                  </p>
                  <p className="mt-1 tabular-nums">
                    {formatVisitWhen(
                      typeof primary.visitDate === "string"
                        ? primary.visitDate
                        : new Date(
                            primary.visitDate as unknown as number,
                          ).toISOString(),
                    )}
                  </p>
                  {props.summary ? (
                    <p className="mt-1 text-sm">
                      {procedureCount} procedure
                      {procedureCount === 1 ? "" : "s"}
                      {procedureCount > 0 ? (
                        <>
                          {" "}
                          · {t("visit.balance")}{" "}
                          <strong>
                            {formatCents(props.summary.balanceCents)}
                          </strong>
                          {hasBalance ? "" : ` (${t("visit.paid")})`}
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <p>{t("visit.startBlockedOrManual")}</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            disabled={props.busy}
            onClick={() => props.onCloseExistingAndStart()}
          >
            {t("visit.startBlockedCloseAndStart")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={props.busy}
            className="w-full"
            onClick={() => props.onOpenChange(false)}
          >
            {t("visit.startBlockedCancelManual")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VisitCloseConfirmDialog(props: {
  open: boolean;
  role: Role;
  summary: Summary | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useLocale();
  const procedureCount = props.summary?.chargeLines.length ?? 0;
  const balanceCents = props.summary?.balanceCents ?? 0;
  const hasProcedures = procedureCount > 0;
  const hasBalance = balanceCents > 0;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-amber-600"
              aria-hidden
            />
            {t("visit.closeTitle")}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-left text-sm text-muted-foreground">
              {!hasProcedures ? (
                <p className="rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  {t("visit.closeNoProcedures")}
                </p>
              ) : (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-foreground">
                  {t("visit.closeSummary", {
                    count: procedureCount,
                    paid: formatCents(props.summary?.paidCents ?? 0),
                    balance: hasBalance
                      ? t("visit.closeBalanceDue", {
                          amount: formatCents(balanceCents),
                        })
                      : t("visit.closeBalanceSettled"),
                  })}
                </p>
              )}

              {hasProcedures ? <p>{t("visit.closeLocks")}</p> : null}

              <p className="text-xs">{t("visit.closeTip")}</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={props.busy}
            onClick={() => props.onOpenChange(false)}
          >
            {t("visit.closeKeepOpen")}
          </Button>
          <Button
            type="button"
            disabled={props.busy}
            onClick={() => props.onConfirm()}
          >
            {t("visit.closeConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VisitDeleteConfirmDialog(props: {
  open: boolean;
  preview: VisitDeletePreview | null;
  patientLabel: string;
  busy?: boolean;
  understood: boolean;
  onUnderstoodChange: (v: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useLocale();
  const p = props.preview;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5 shrink-0" aria-hidden />
            {t("visit.deleteTitle")}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-left text-sm text-muted-foreground">
              <p>{t("visit.deleteAdminOnly")}</p>
              {p ? (
                <ul className="list-inside list-disc rounded-md border bg-muted/30 px-3 py-2 text-foreground">
                  <li>
                    {p.status} · {new Date(p.visitDate).toLocaleString()}
                  </li>
                  <li>
                    {p.procedureCount} procedures, {p.paymentCount} payments
                  </li>
                  <li>
                    {formatCents(p.chargesCents)} / {formatCents(p.paidCents)}
                  </li>
                </ul>
              ) : null}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="visit-delete-understood"
                  checked={props.understood}
                  onCheckedChange={(v) => props.onUnderstoodChange(v === true)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="visit-delete-understood"
                  className="cursor-pointer text-sm leading-snug text-foreground"
                >
                  {t("visit.deleteUnderstand")}
                </label>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={props.busy}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={props.busy || !props.understood || !p}
            onClick={() => props.onConfirm()}
          >
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
