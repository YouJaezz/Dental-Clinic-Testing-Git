import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { patientDocuments } from "@/db/schema";
import { canReadClinicalData, forbidUnless } from "@/lib/authz";
import { json } from "@/lib/http-api";

/** Strip characters that would break the Content-Disposition header. */
function safeFileName(name: string): string {
  return name.replace(/["\\\r\n]/g, "_") || "document";
}

export const GET: APIRoute = async ({ params, url, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const id = params.id?.trim();
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const rows = await db
    .select()
    .from(patientDocuments)
    .where(eq(patientDocuments.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return json({ error: "Not found" }, { status: 404 });

  const bytes = Buffer.from(row.dataBase64, "base64");
  const disposition = url.searchParams.has("download") ? "attachment" : "inline";

  return new Response(bytes, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${disposition}; filename="${safeFileName(row.fileName)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
};
