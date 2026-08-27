import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MEDICAL_HISTORY_OPTIONS,
} from "@/lib/medical-history";
import {
  computeAgeFromBirthMs,
  parseManilaBirthDateYmdToUtcMs,
  validateBirthDateMs,
} from "@/lib/patient-age";
import { PATIENT_CIVIL_STATUSES, type PatientCivilStatus } from "@/lib/patient-civil-status";
import { PATIENT_GENDERS, type PatientGender } from "@/lib/patient-gender";

export type GenderFormValue = "" | PatientGender;
export type CivilStatusFormValue = "" | PatientCivilStatus;

export function agePreviewFromDobYmd(ymd: string): string | null {
  const t = ymd.trim();
  if (!t) return null;
  const ms = parseManilaBirthDateYmdToUtcMs(t);
  if (ms == null) return null;
  if (validateBirthDateMs(ms)) return null;
  return String(computeAgeFromBirthMs(ms));
}

export function MedicalHistoryCheckboxes(props: {
  idPrefix: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(id: string, checked: boolean) {
    if (checked) {
      const next = [...props.selected];
      if (!next.includes(id)) next.push(id);
      props.onChange(next);
    } else {
      props.onChange(props.selected.filter((x) => x !== id));
    }
  }

  return (
    <div className="space-y-2">
      <Label>Medical history</Label>
      <p className="text-xs text-muted-foreground">
        Check all that apply — common conditions to note before dental
        treatment.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {MEDICAL_HISTORY_OPTIONS.map((opt) => (
          <div key={opt.id} className="flex items-start gap-2">
            <Checkbox
              id={`${props.idPrefix}-${opt.id}`}
              checked={props.selected.includes(opt.id)}
              onCheckedChange={(v) => toggle(opt.id, v === true)}
              disabled={props.disabled}
              className="mt-0.5"
            />
            <label
              htmlFor={`${props.idPrefix}-${opt.id}`}
              className="cursor-pointer text-sm font-normal leading-snug text-foreground peer-disabled:cursor-not-allowed"
            >
              {opt.label}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GenderRadios(props: {
  name: string;
  value: GenderFormValue;
  onChange: (v: GenderFormValue) => void;
  disabled?: boolean;
  legacyHint?: string | null;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium leading-none">Gender</span>
      {props.legacyHint ? (
        <p className="text-xs text-muted-foreground">
          Earlier value on file:{" "}
          <span className="font-medium text-foreground">{props.legacyHint}</span>.
          Choose Male or Female to replace it.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {PATIENT_GENDERS.map((g) => (
          <label
            key={g}
            className="flex cursor-pointer items-center gap-2 text-sm font-normal leading-none text-foreground"
          >
            <input
              type="radio"
              name={props.name}
              className="h-4 w-4 accent-primary"
              checked={props.value === g}
              onChange={() => props.onChange(g)}
              disabled={props.disabled}
            />
            {g}
          </label>
        ))}
        <label className="flex cursor-pointer items-center gap-2 text-sm font-normal leading-none text-muted-foreground">
          <input
            type="radio"
            name={props.name}
            className="h-4 w-4 accent-primary"
            checked={props.value === ""}
            onChange={() => props.onChange("")}
            disabled={props.disabled}
          />
          Prefer not to say
        </label>
      </div>
    </div>
  );
}

export function CivilStatusSelect(props: {
  id: string;
  value: CivilStatusFormValue;
  onChange: (v: CivilStatusFormValue) => void;
  disabled?: boolean;
  legacyHint?: string | null;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={props.id}>Civil status</Label>
      {props.legacyHint ? (
        <p className="text-xs text-muted-foreground">
          Earlier value on file:{" "}
          <span className="font-medium text-foreground">{props.legacyHint}</span>.
          Choose an option below to replace it.
        </p>
      ) : null}
      <select
        id={props.id}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={props.value}
        onChange={(e) =>
          props.onChange(e.target.value as CivilStatusFormValue)
        }
        disabled={props.disabled}
      >
        <option value="">— Select —</option>
        {PATIENT_CIVIL_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </div>
  );
}
