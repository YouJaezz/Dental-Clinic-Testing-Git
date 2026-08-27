import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { prescriptions } from "@/db/schema";

export async function allocatePrescriptionNumber(): Promise<number> {
  const [{ max }] = await db
    .select({
      max: sql<number>`coalesce(max(${prescriptions.prescriptionNumber}), 0)`,
    })
    .from(prescriptions);
  return (max ?? 0) + 1;
}
