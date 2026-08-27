import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { recordAudit } from "@/lib/audit-log";
import { json } from "@/lib/http-api";
import { getClinicAdminEmail, sendMail } from "@/lib/mail";
import { CLINIC_NAME } from "@/lib/clinic-branding";

const bodySchema = z.object({
  email: z.string().trim().email(),
});

const GENERIC_OK =
  "If an account exists for that email, the clinic administrator has been notified. They can reset your password from Administration.";

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const row = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const adminEmail = getClinicAdminEmail();
  const at = new Date().toISOString();

  if (row[0]) {
    const text = [
      `${CLINIC_NAME} — password reset request`,
      "",
      `A user requested a password reset for: ${row[0].email}`,
      `Time (UTC): ${at}`,
      "",
      "Sign in as an administrator, open Administration → Users, and use Reset password for this account.",
    ].join("\n");

    const mailResult = await sendMail({
      to: adminEmail,
      subject: `[${CLINIC_NAME}] Password reset requested`,
      text,
    });

    await recordAudit(
      { userId: null, userEmail: row[0].email },
      {
        action: "auth.password_reset_requested",
        entityType: "user",
        entityId: row[0].id,
        summary: `Password reset requested for ${row[0].email}`,
        details: {
          requestedEmail: row[0].email,
          notifiedAdmin: adminEmail,
          emailSent: mailResult.sent,
          emailDetail: mailResult.detail,
          notificationText: text,
        },
      },
    );
  }

  return json({ message: GENERIC_OK });
};
