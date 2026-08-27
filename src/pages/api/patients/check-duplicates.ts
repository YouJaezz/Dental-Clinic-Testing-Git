import type { APIRoute } from "astro";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";
import {
  duplicateCheckSummary,
  findPotentialDuplicatePatients,
} from "@/lib/patient-duplicate-check";

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const firstName = url.searchParams.get("firstName")?.trim() ?? "";
  const lastName = url.searchParams.get("lastName")?.trim() ?? "";
  if (!firstName || !lastName) {
    return json({ error: "firstName and lastName are required" }, { status: 400 });
  }

  const duplicates = await findPotentialDuplicatePatients({
    firstName,
    lastName,
    dateOfBirth: url.searchParams.get("dateOfBirth")?.trim() || null,
    contactNumber: url.searchParams.get("contactNumber")?.trim() || null,
  });

  return json({
    duplicates,
    summary: duplicateCheckSummary(duplicates),
    hasStrongMatch: duplicates.some((d) => d.matchKind === "same_name_dob"),
  });
};
