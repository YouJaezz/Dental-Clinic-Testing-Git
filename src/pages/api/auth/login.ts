import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import {
  createSession,
  sessionCookieHeader,
  verifyPassword,
} from "@/lib/auth-server";
import { isDeviceBlocked } from "@/lib/device-block";
import { deviceLabelFromUserAgent, clientIpFromRequest } from "@/lib/device-label";
import { localeCookieHeader } from "@/lib/locale-cookie";
import { parseLocale } from "@/lib/locale-cookie";
import { SESSION_TTL_MS } from "@/lib/session";

const bodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const POST: APIRoute = async ({ request }) => {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid credentials" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { email, password } = parsed.data;
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  const user = userRows[0];

  const invalid = () =>
    new Response(JSON.stringify({ error: "Invalid email or password" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });

  if (!user) {
    return invalid();
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return invalid();
  }

  const ua = request.headers.get("user-agent");
  const ipAddress = clientIpFromRequest(request);
  const deviceLabel = deviceLabelFromUserAgent(ua);
  if (await isDeviceBlocked({ ipAddress, deviceLabel })) {
    return new Response(
      JSON.stringify({
        error:
          "This device or network is blocked. Contact the clinic administrator.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const sessionId = await createSession(user.id, {
    userAgent: ua,
    ipAddress,
    deviceLabel,
  });
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const locale = parseLocale(user.locale);

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", sessionCookieHeader(sessionId, maxAge));
  headers.append("Set-Cookie", localeCookieHeader(locale, maxAge));

  return new Response(
    JSON.stringify({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        locale,
      },
    }),
    { status: 200, headers },
  );
};
