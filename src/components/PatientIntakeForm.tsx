import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PatientIntakeDuplicateDialog } from "@/components/PatientIntakeDuplicateDialog";
import { api } from "@/lib/api-client";
import { CLINIC_NAME } from "@/lib/clinic-branding";
import { ClinicLogo } from "@/components/ClinicLogo";
import { PATIENT_INTAKE_TERMS_TEXT } from "@/lib/patient-intake-terms";
import type { PatientCivilStatus } from "@/lib/patient-civil-status";
import type { PatientGender } from "@/lib/patient-gender";
import {
  agePreviewFromDobYmd,
  CivilStatusSelect,
  GenderRadios,
  MedicalHistoryCheckboxes,
  type CivilStatusFormValue,
  type GenderFormValue,
} from "@/components/patient-form-controls";

const emptyForm = () => ({
  firstName: "",
  lastName: "",
  contactNumber: "",
  dateOfBirth: "",
  gender: "" as GenderFormValue,
  civilStatus: "" as CivilStatusFormValue,
  address: "",
  medicalHistoryConditions: [] as string[],
  notes: "",
  termsAccepted: false,
});

export function PatientIntakeForm() {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateSummary, setDuplicateSummary] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setErr("Please enter your first and last name.");
      return;
    }
    if (!form.termsAccepted) {
      setErr("Please read and accept the terms before submitting.");
      return;
    }

    setBusy(true);
    const { ok, data, status } = await api<{
      ok?: boolean;
      error?: string;
      message?: string;
      code?: string;
      summary?: string;
    }>("/api/public/patient-intake", {
      method: "POST",
      body: JSON.stringify({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        contactNumber: form.contactNumber.trim() || null,
        dateOfBirth: form.dateOfBirth.trim() || null,
        gender:
          form.gender === "" ? null : (form.gender satisfies PatientGender),
        civilStatus:
          form.civilStatus === ""
            ? null
            : (form.civilStatus satisfies PatientCivilStatus),
        address: form.address.trim() || null,
        medicalHistoryConditions: form.medicalHistoryConditions,
        notes: form.notes.trim() || null,
        termsAccepted: true as const,
      }),
    });
    setBusy(false);

    if (!ok) {
      if (status === 409 && data.code === "POTENTIAL_DUPLICATE") {
        setDuplicateSummary(data.summary ?? data.error ?? null);
        setDuplicateOpen(true);
        setErr(
          "Existing record found — please see the assistant (popup has details).",
        );
        return;
      }
      setErr(data.error ?? "Could not submit. Please try again or ask staff.");
      return;
    }

    setDuplicateOpen(false);
    setDuplicateSummary(null);
    setSubmitted(true);
    setForm(emptyForm());
  }

  function clearForm() {
    setErr(null);
    setDuplicateOpen(false);
    setDuplicateSummary(null);
    setForm(emptyForm());
  }

  if (submitted) {
    return (
      <div className="clinic-card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold">Thank you</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your information was submitted to {CLINIC_NAME}. Our staff will
          review your record. You may take a seat and wait to be called.
        </p>
        <Button
          type="button"
          className="mt-6"
          variant="secondary"
          onClick={() => setSubmitted(false)}
        >
          Register another person
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PatientIntakeDuplicateDialog
        open={duplicateOpen}
        summary={duplicateSummary}
        onOpenChange={setDuplicateOpen}
      />

      <header className="flex flex-col items-center gap-3 text-center">
        <ClinicLogo size="md" className="lg:hidden" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {CLINIC_NAME}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            New patient registration — please fill in your details below.
          </p>
        </div>
      </header>

      {err ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            duplicateOpen
              ? "border-amber-200/80 bg-amber-50/60 text-amber-950"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
          role="alert"
        >
          {err}
        </p>
      ) : null}

      <form
        className="clinic-card space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="pi-fn">First name *</Label>
            <Input
              id="pi-fn"
              required
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) =>
                setForm((s) => ({ ...s, firstName: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="pi-ln">Last name *</Label>
            <Input
              id="pi-ln"
              required
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) =>
                setForm((s) => ({ ...s, lastName: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="pi-dob">Date of birth</Label>
            <p className="text-xs text-muted-foreground">
              Helps us match you to an existing chart if you registered before.
            </p>
            <Input
              id="pi-dob"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) =>
                setForm((s) => ({ ...s, dateOfBirth: e.target.value }))
              }
            />
            {agePreviewFromDobYmd(form.dateOfBirth) != null ? (
              <p className="text-xs text-muted-foreground">
                Age: {agePreviewFromDobYmd(form.dateOfBirth)}
              </p>
            ) : null}
          </div>
          <GenderRadios
            name="intake-gender"
            value={form.gender}
            onChange={(v) => setForm((s) => ({ ...s, gender: v }))}
          />
        </div>

        <CivilStatusSelect
          id="pi-civil"
          value={form.civilStatus}
          onChange={(v) => setForm((s) => ({ ...s, civilStatus: v }))}
        />

        <div className="grid gap-1">
          <Label htmlFor="pi-addr">Address</Label>
          <Textarea
            id="pi-addr"
            value={form.address}
            onChange={(e) =>
              setForm((s) => ({ ...s, address: e.target.value }))
            }
          />
        </div>

        <div className="grid gap-1">
          <Label htmlFor="pi-cn">Contact #</Label>
          <Input
            id="pi-cn"
            type="tel"
            autoComplete="tel"
            value={form.contactNumber}
            onChange={(e) =>
              setForm((s) => ({ ...s, contactNumber: e.target.value }))
            }
          />
        </div>

        <MedicalHistoryCheckboxes
          idPrefix="intake-mh"
          selected={form.medicalHistoryConditions}
          onChange={(ids) =>
            setForm((s) => ({ ...s, medicalHistoryConditions: ids }))
          }
        />

        <div className="grid gap-1">
          <Label htmlFor="pi-notes">Other notes (optional)</Label>
          <Textarea
            id="pi-notes"
            value={form.notes}
            onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
          />
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="pi-terms"
              checked={form.termsAccepted}
              onCheckedChange={(v) =>
                setForm((s) => ({ ...s, termsAccepted: v === true }))
              }
              className="mt-1"
            />
            <label
              htmlFor="pi-terms"
              className="cursor-pointer text-sm leading-relaxed text-foreground"
            >
              {PATIENT_INTAKE_TERMS_TEXT}
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" disabled={busy} className="flex-1 sm:flex-none">
            {busy ? "Submitting…" : "Submit registration"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={clearForm}
          >
            Clear
          </Button>
        </div>
      </form>
    </div>
  );
}
