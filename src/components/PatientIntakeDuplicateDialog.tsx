import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CLINIC_NAME } from "@/lib/clinic-branding";

type Props = {
  open: boolean;
  summary?: string | null;
  onOpenChange: (open: boolean) => void;
};

export function PatientIntakeDuplicateDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <UserCheck
              className="h-5 w-5 shrink-0 text-primary"
              aria-hidden
            />
            You may already be registered
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-left text-sm text-muted-foreground">
              {props.summary ? (
                <p className="rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  {props.summary}
                </p>
              ) : (
                <p>
                  We found an existing patient record at {CLINIC_NAME} that
                  matches the name and details you entered (especially if your
                  date of birth was included).
                </p>
              )}

              <div className="space-y-2 text-foreground">
                <p className="font-medium">If this is you</p>
                <p>
                  Please <strong>do not submit this form again</strong>. Go to
                  the <strong>front desk or dental assistant</strong> and give
                  your name — they will find your existing chart and check you
                  in.
                </p>
              </div>

              <div className="space-y-2 text-foreground">
                <p className="font-medium">
                  If this is not you, or the message keeps appearing
                </p>
                <p>
                  Your name or birthday might match someone else in our system,
                  or something was typed incorrectly. Please see the{" "}
                  <strong>assistant</strong> for{" "}
                  <strong>manual registration</strong> — do not keep submitting;
                  the same message will appear until staff helps you.
                </p>
              </div>

              <p className="text-xs">
                Tip: Double-check spelling of your name and date of birth before
                asking staff for help.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full"
            onClick={() => props.onOpenChange(false)}
          >
            I understand — I&apos;ll see the assistant
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => props.onOpenChange(false)}
          >
            Review my entries
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
