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
import type { Patient } from "@/lib/clinical-types";
import {
  formatDuplicatePatientLine,
  type PotentialDuplicate,
} from "@/lib/patient-duplicate-types";

type Props = {
  open: boolean;
  summary: string;
  duplicates: PotentialDuplicate[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onUseExisting: (patient: Patient) => void;
  onCreateAnyway: () => void;
};

function matchKindLabel(kind: PotentialDuplicate["matchKind"]): string {
  if (kind === "same_name_dob") return "Name + birthday match";
  return "Same name — verify";
}

export function PatientDuplicateDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-amber-600"
              aria-hidden
            />
            Possible duplicate patient
          </DialogTitle>
          <DialogDescription>{props.summary}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(50vh,20rem)] space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-2">
          {props.duplicates.map((d) => (
            <div
              key={d.patient.id}
              className="rounded-md border bg-card px-3 py-2 text-sm"
            >
              <p className="font-medium">
                {formatDuplicatePatientLine(d.patient)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {matchKindLabel(d.matchKind)}
                </span>
                {" — "}
                {d.matchReason}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2 h-8"
                disabled={props.busy}
                onClick={() => props.onUseExisting(d.patient)}
              >
                Use this record
              </Button>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Same name and birthday can still be two different people (e.g. twins).
          Only choose &quot;Create new patient anyway&quot; if you are sure this is
          a different person.
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={props.busy}
            onClick={() => props.onOpenChange(false)}
          >
            Go back and edit
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={props.busy}
            onClick={() => props.onCreateAnyway()}
          >
            Create new patient anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
