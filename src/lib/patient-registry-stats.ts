import { and, count, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { patients } from "@/db/schema";
import { manilaDayBoundsMs, toManilaDateKey } from "@/lib/manila-date";

export type PatientRegistryStats = {
  totalCount: number;
  addedTodayCount: number;
  /** Manila calendar yyyy-MM-dd used for “today”. */
  todayKey: string;
};

export async function loadPatientRegistryStats(): Promise<PatientRegistryStats> {
  const todayKey = toManilaDateKey(new Date());
  const bounds = manilaDayBoundsMs(todayKey);
  const active = isNull(patients.deletedAt);

  const [{ totalCount }] = await db
    .select({ totalCount: count() })
    .from(patients)
    .where(active);

  let addedTodayCount = 0;
  if (bounds) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(patients)
      .where(
        and(
          active,
          gte(patients.createdAt, new Date(bounds.startMs)),
          lte(patients.createdAt, new Date(bounds.endMs)),
        ),
      );
    addedTodayCount = n ?? 0;
  }

  return {
    totalCount: totalCount ?? 0,
    addedTodayCount,
    todayKey,
  };
}
