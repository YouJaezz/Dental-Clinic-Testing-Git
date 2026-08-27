import { and, count, desc, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { patients } from "@/db/schema";
import { sanitizeLikeFragment } from "@/lib/http-api";
import { manilaDateKeyAddDays, manilaDayBoundsMs, toManilaDateKey } from "@/lib/manila-date";
import {
  PATIENT_LIST_DEFAULT_PAGE_SIZE,
  PATIENT_LIST_MAX_PAGE_SIZE,
} from "@/lib/patient-list-constants";
import { patientRowToPublic } from "@/lib/patient-dto";

export {
  PATIENT_LIST_DEFAULT_PAGE_SIZE,
  PATIENT_LIST_MAX_PAGE_SIZE,
} from "@/lib/patient-list-constants";

export const patientListRegistryFilters = [
  "all",
  "new_today",
  "recent_7d",
] as const;

export type PatientListRegistryFilter =
  (typeof patientListRegistryFilters)[number];

export type PatientListParams = {
  q: string;
  page: number;
  pageSize: number;
  registryFilter: PatientListRegistryFilter;
};

export type PatientListResult = {
  patients: ReturnType<typeof patientRowToPublic>[];
  totalCount: number;
  matchCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export function parsePatientListParams(url: URL): PatientListParams {
  const q = url.searchParams.get("q")?.trim() ?? "";
  const pageRaw = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const sizeRaw = Number.parseInt(
    url.searchParams.get("pageSize") ?? String(PATIENT_LIST_DEFAULT_PAGE_SIZE),
    10,
  );
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Number.isFinite(sizeRaw)
    ? Math.min(PATIENT_LIST_MAX_PAGE_SIZE, Math.max(10, sizeRaw))
    : PATIENT_LIST_DEFAULT_PAGE_SIZE;
  const filterRaw = url.searchParams.get("filter")?.trim() ?? "all";
  const registryFilter = patientListRegistryFilters.includes(
    filterRaw as PatientListRegistryFilter,
  )
    ? (filterRaw as PatientListRegistryFilter)
    : "all";
  return { q, page, pageSize, registryFilter };
}

function registryFilterSql(filter: PatientListRegistryFilter): SQL | undefined {
  if (filter === "all") return undefined;
  const todayKey = toManilaDateKey(new Date());
  if (filter === "new_today") {
    const bounds = manilaDayBoundsMs(todayKey);
    if (!bounds) return undefined;
    return and(
      gte(patients.createdAt, new Date(bounds.startMs)),
      lte(patients.createdAt, new Date(bounds.endMs)),
    );
  }
  const weekStartKey = manilaDateKeyAddDays(todayKey, -6);
  const weekBounds = manilaDayBoundsMs(weekStartKey);
  if (!weekBounds) return undefined;
  return gte(patients.createdAt, new Date(weekBounds.startMs));
}

function activePatientFilter(): SQL {
  return isNull(patients.deletedAt);
}

function searchFilter(term: string): SQL {
  const like = `%${sanitizeLikeFragment(term).toLowerCase()}%`;
  return sql`(lower(${patients.firstName}) || ' ' || lower(${patients.lastName}) || ' ' || lower(coalesce(${patients.contactNumber},'')) || ' ' || lower(coalesce(${patients.address},'')) || ' ' || lower(coalesce(${patients.medicalHistory},'')) || ' ' || lower(coalesce(${patients.gender},'')) || ' ' || lower(coalesce(${patients.civilStatus},''))) like ${like}`;
}

export async function loadPatientList(
  params: PatientListParams,
): Promise<PatientListResult> {
  const { q, page, pageSize, registryFilter } = params;
  const offset = (page - 1) * pageSize;

  const [{ totalCount }] = await db
    .select({ totalCount: count() })
    .from(patients)
    .where(activePatientFilter());

  const registryTotal = totalCount ?? 0;
  const registrySql = registryFilterSql(registryFilter);
  const baseList = registrySql
    ? and(activePatientFilter(), registrySql)
    : activePatientFilter();
  const listWhere = q ? and(baseList, searchFilter(q)) : baseList;

  let matchCount = registryTotal;
  if (q) {
    const [{ matchCount: mc }] = await db
      .select({ matchCount: count() })
      .from(patients)
      .where(listWhere);
    matchCount = mc ?? 0;
  }

  const rows = await db
    .select()
    .from(patients)
    .where(listWhere)
    .orderBy(desc(patients.createdAt))
    .limit(pageSize)
    .offset(offset);

  const pageCount = matchCount === 0 ? 0 : Math.ceil(matchCount / pageSize);

  return {
    patients: rows.map(patientRowToPublic),
    totalCount: registryTotal,
    matchCount,
    page,
    pageSize,
    pageCount,
  };
}
