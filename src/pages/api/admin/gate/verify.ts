import type { APIRoute } from "astro";
import { z } from "zod";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { isAdminI, forbidUnless } from "@/lib/authz";
import {
  adminGateCookieHeader,
  createAdminGateGrant,
  getAdminGateConfig,
  verifyAdminGateCode,
} from "@/lib/admin-gate";
import { json } from "@/lib/http-api";

const bodySchema = z.object({
  code: z.string().min(4).max(64),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = forbidUnless(isAdminI(locals.userRole));
  if (denied) return denied;

  const config = await getAdminGateConfig();
  if (!config.configured) {
    return json(
      {
        error:
          "No administration passcode has been set yet. Ask Admin II to create one under Advanced tools.",
      },
      { status: 503 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return json({ error: "Invalid passcode" }, { status: 400 });
  }

  const ok = await verifyAdminGateCode(body.code);
  if (!ok) {
    return json({ error: "Incorrect passcode" }, { status: 401 });
  }

  const grant = await createAdminGateGrant(locals.userId);

  await recordAudit(auditActorFromLocals(locals), {
    action: "admin_gate.unlocked",
    entityType: "admin_gate",
    entityId: "default",
    summary: "Admin I unlocked administration area",
  });

  return new Response(JSON.stringify({ ok: true, unlocked: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": adminGateCookieHeader(grant.token, grant.maxAge),
    },
  });
};
