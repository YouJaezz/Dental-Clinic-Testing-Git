import type { APIRoute } from "astro";
import { z } from "zod";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import { canUseAdvancedAdmin, forbidUnless } from "@/lib/authz";
import { getAdminGateConfig, setAdminGateCode } from "@/lib/admin-gate";
import { json } from "@/lib/http-api";

export const GET: APIRoute = async () => {
  const config = await getAdminGateConfig();
  return json({
    configured: config.configured,
    updatedAt: config.updatedAt?.toISOString() ?? null,
  });
};

const putSchema = z.object({
  newCode: z.string().min(4).max(64),
  confirmCode: z.string().min(4).max(64),
});

export const PUT: APIRoute = async ({ request, locals }) => {
  const denied = forbidUnless(canUseAdvancedAdmin(locals.userRole));
  if (denied) return denied;
  if (!locals.userId) return json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof putSchema>;
  try {
    body = putSchema.parse(await request.json());
  } catch {
    return json({ error: "Passcode must be at least 4 characters" }, { status: 400 });
  }

  if (body.newCode !== body.confirmCode) {
    return json({ error: "Passcodes do not match" }, { status: 400 });
  }

  await setAdminGateCode(body.newCode, locals.userId);

  await recordAudit(auditActorFromLocals(locals), {
    action: "admin_gate.updated",
    entityType: "admin_gate",
    entityId: "default",
    summary: "Admin II updated the administration passcode",
  });

  return json({ ok: true, configured: true });
};
