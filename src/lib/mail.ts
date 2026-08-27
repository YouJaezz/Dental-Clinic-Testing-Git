/** Clinic admin inbox for password-reset alerts (override via CLINIC_ADMIN_EMAIL). */
export const DEFAULT_CLINIC_ADMIN_EMAIL = "xjaequeral@gmail.com";

export function getClinicAdminEmail(): string {
  const fromEnv = import.meta.env.CLINIC_ADMIN_EMAIL;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return DEFAULT_CLINIC_ADMIN_EMAIL;
}

export type SendMailResult = { sent: boolean; detail?: string };

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
}): Promise<SendMailResult> {
  const host = import.meta.env.SMTP_HOST;
  const portRaw = import.meta.env.SMTP_PORT;
  const user = import.meta.env.SMTP_USER;
  const pass = import.meta.env.SMTP_PASS;
  const from =
    (typeof import.meta.env.SMTP_FROM === "string" &&
      import.meta.env.SMTP_FROM.trim()) ||
    user ||
    `noreply@${host ?? "localhost"}`;

  if (!host || !portRaw) {
    return {
      sent: false,
      detail:
        "SMTP not configured (set SMTP_HOST, SMTP_PORT, and optionally SMTP_USER/SMTP_PASS). Notification was recorded in the change history.",
    };
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port)) {
    return { sent: false, detail: "Invalid SMTP_PORT" };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    await transport.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[mail]", msg);
    return { sent: false, detail: msg };
  }
}
