import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { db, getActiveDatabaseProvider } from "@/db/client";

export const GET: APIRoute = async () => {
  await db.execute(sql`select 1`);
  return new Response(
    JSON.stringify({
      ok: true,
      database: "reachable",
      provider: getActiveDatabaseProvider(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
