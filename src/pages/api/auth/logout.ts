import type { APIRoute } from "astro";
import {
  clearSessionCookieHeader,
  deleteSession,
  getSessionIdFromRequest,
} from "@/lib/auth-server";

export const POST: APIRoute = async ({ request }) => {
  const sessionId = getSessionIdFromRequest(request);
  if (sessionId) {
    await deleteSession(sessionId);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookieHeader(),
    },
  });
};
