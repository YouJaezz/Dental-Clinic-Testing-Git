import type { MiddlewareHandler } from "astro";
import {
  getSessionUserFromRequest,
  type SessionUser,
} from "@/lib/auth-server";
import { needsAdminIISetup } from "@/lib/admin-ii-bootstrap";
import {
  adminIGateRequired,
  getAdminGateConfig,
  hasValidAdminGateGrant,
  pathExemptFromAdminIISetup,
} from "@/lib/admin-gate";
import { isAdminLike } from "@/lib/authz";
import { readLocaleFromCookieHeader } from "@/lib/locale-cookie";

/** Routes that skip session checks (document each addition). */
const PUBLIC_API_ROUTES: ReadonlyArray<{ pathname: string; method: string }> = [
  { pathname: "/api/auth/login", method: "POST" },
  { pathname: "/api/auth/logout", method: "POST" },
  { pathname: "/api/auth/forgot-password", method: "POST" },
  { pathname: "/api/public/patient-intake", method: "POST" },
];

const PUBLIC_PAGE_PATHS = ["/register"] as const;

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isPublicApiRoute(pathname: string, method: string): boolean {
  return PUBLIC_API_ROUTES.some(
    (r) => r.pathname === pathname && r.method === method,
  );
}

function isHealthCheckAuthorized(
  request: Request,
  user: SessionUser | null,
): boolean {
  if (user) return true;
  const secret = process.env.HEALTH_CHECK_SECRET;
  if (!secret || typeof secret !== "string") return false;
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === secret;
}

function unauthorizedApi(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function setSessionLocals(
  locals: App.Locals,
  user: SessionUser,
  request: Request,
): void {
  locals.userId = user.userId;
  locals.userEmail = user.email;
  locals.userRole = user.role;
  locals.userLocale =
    readLocaleFromCookieHeader(request.headers.get("cookie")) ?? "en";
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { pathname } = context.url;
  const method = context.request.method;

  if (pathname.startsWith("/_astro/") || pathname.startsWith("/favicon")) {
    return next();
  }

  if (pathname === "/login") {
    const user = await getSessionUserFromRequest(context.request);
    if (user) {
      return context.redirect("/patients");
    }
    return next();
  }

  if (isPublicPage(pathname)) {
    return next();
  }

  if (isPublicApiRoute(pathname, method)) {
    return next();
  }

  if (pathname === "/api/health" && method === "GET") {
    const user = await getSessionUserFromRequest(context.request);
    if (!isHealthCheckAuthorized(context.request, user)) {
      return unauthorizedApi();
    }
    if (user) {
      setSessionLocals(context.locals, user, context.request);
    }
    return next();
  }

  const user = await getSessionUserFromRequest(context.request);
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return unauthorizedApi();
    }
    return context.redirect("/login");
  }

  setSessionLocals(context.locals, user, context.request);

  if (pathname.startsWith("/analytics") && !isAdminLike(user.role)) {
    return context.redirect("/patients");
  }

  if (
    pathname.startsWith("/sales") &&
    user.role !== "ADMIN_I" &&
    user.role !== "ADMIN_II" &&
    user.role !== "USER"
  ) {
    return context.redirect("/patients");
  }

  if (pathname.startsWith("/admin") && !isAdminLike(user.role)) {
    return context.redirect("/patients");
  }

  if (
    isAdminLike(user.role) &&
    (await needsAdminIISetup()) &&
    !pathExemptFromAdminIISetup(pathname)
  ) {
    if (pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({
          error: "Choose an Admin II account before using Administration.",
          code: "ADMIN_II_SETUP_REQUIRED",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    if (pathname !== "/admin/setup-admin-ii") {
      return context.redirect("/admin/setup-admin-ii");
    }
  }

  if (adminIGateRequired(user.role, pathname)) {
    const config = await getAdminGateConfig();
    if (!config.configured) {
      if (pathname.startsWith("/api/")) {
        return new Response(
          JSON.stringify({
            error:
              "Administration passcode is not configured. Ask Admin II to set it.",
            code: "ADMIN_GATE_NOT_CONFIGURED",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      if (pathname !== "/admin/unlock") {
        return context.redirect("/admin/unlock");
      }
    } else if (!(await hasValidAdminGateGrant(context.request, user.userId))) {
      if (pathname.startsWith("/api/")) {
        return new Response(
          JSON.stringify({
            error: "Enter the administration passcode to continue.",
            code: "ADMIN_GATE_REQUIRED",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      const returnTo = encodeURIComponent(pathname + context.url.search);
      return context.redirect(`/admin/unlock?return=${returnTo}`);
    }
  }

  return next();
};
