import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/lib/use-locale";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Simple alert for USER / TRAINEE — no close/cancel choices. */
export function VisitOpenBlockDialog(props: Props) {
  const { t } = useLocale();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="max-w-md gap-4"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle
              className="h-6 w-6 shrink-0 text-amber-600"
              aria-hidden
            />
            {t("visit.openBlockTitle")}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-2 text-left text-base leading-relaxed text-foreground">
              <p className="font-medium">{t("visit.openBlockLead")}</p>
              <p className="text-muted-foreground">{t("visit.openBlockHelp")}</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            className="w-full text-base"
            size="lg"
            onClick={() => props.onOpenChange(false)}
          >
            {t("visit.openBlockOk")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
