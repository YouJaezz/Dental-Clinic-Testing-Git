import type { APIRoute } from "astro";
import { z } from "zod";
import { recordAudit } from "@/lib/audit-log";
import { json } from "@/lib/http-api";
import {
  createPatientFromBody,
  patientCreateBodySchema,
} from "@/lib/patient-create";

const intakeSchema = patientCreateBodySchema.extend({
  termsAccepted: z
    .boolean()
    .refine((v) => v === true, {
      message: "You must accept the terms before submitting",
    }),
});

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = intakeSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { termsAccepted: _terms, ...createBody } = parsed.data;
  const result = await createPatientFromBody(createBody, {
    intakeSourceNote: true,
    allowDuplicateOverride: false,
  });

  if (!result.ok) {
    return json(
      {
        error: result.error,
        code: result.code,
        summary: result.summary,
        message:
          "We may already have your record on file. Please see the dental assistant at the front desk — do not submit this form again.",
        duplicates: result.duplicates?.map((d) => ({
          matchKind: d.matchKind,
          matchReason: d.matchReason,
        })),
      },
      { status: result.status },
    );
  }

  const p = result.patient;
  await recordAudit(
    { userId: null, userEmail: "public-intake" },
    {
      action: "patient.intake",
      entityType: "patient",
      entityId: p.id,
      summary: `Self-registered patient ${p.firstName} ${p.lastName}`,
    },
  );

  return json(
    {
      ok: true,
      message: "Registration received. Thank you.",
      patientId: p.id,
    },
    { status: 201 },
  );
};
