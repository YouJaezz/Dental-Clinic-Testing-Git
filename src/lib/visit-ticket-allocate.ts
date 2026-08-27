import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { visits } from "@/db/schema";

export async function allocateVisitTicketNumber(): Promise<number> {
  const [{ max }] = await db
    .select({
      max: sql<number>`coalesce(max(${visits.ticketNumber}), 0)`,
    })
    .from(visits);
  return (max ?? 0) + 1;
}
