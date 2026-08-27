import type { APIRoute } from "astro";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canMutateClinicalData,
  canReadClinicalData,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import {
  createPatientFromBody,
  patientCreateBodySchema,
} from "@/lib/patient-create";
import { loadPatientList, parsePatientListParams } from "@/lib/patient-list";
import { loadPatientRegistryStats } from "@/lib/patient-registry-stats";

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const params = parsePatientListParams(url);
  const [result, registry] = await Promise.all([
    loadPatientList(params),
    loadPatientRegistryStats(),
  ]);

  return json({
    patients: result.patients,
    totalCount: result.totalCount,
    matchCount: result.matchCount,
    listedCount: result.patients.length,
    page: result.page,
    pageSize: result.pageSize,
    pageCount: result.pageCount,
    addedTodayCount: registry.addedTodayCount,
    todayKey: registry.todayKey,
    registryFilter: params.registryFilter,
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = forbidUnless(canMutateClinicalData(locals.userRole));
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patientCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await createPatientFromBody(parsed.data, {
    allowDuplicateOverride: true,
  });
  if (!result.ok) {
    return json(
      {
        error: result.error,
        code: result.code,
        duplicates: result.duplicates,
        summary: result.summary,
      },
      { status: result.status },
    );
  }

  const p = result.patient;
  await recordAudit(auditActorFromLocals(locals), {
    action: "patient.created",
    entityType: "patient",
    entityId: p.id,
    summary: `Created patient ${p.firstName} ${p.lastName}`,
  });

  return json({ patient: p }, { status: 201 });
};
