import type { AppLocale } from "@/db/schema.shared";
import { appLocale } from "@/db/schema.shared";

export const LOCALE_COOKIE = "clinic_locale";

export function parseLocale(value: string | null | undefined): AppLocale {
  if (value === "tl") return "tl";
  return "en";
}

export function isAppLocale(value: string): value is AppLocale {
  return (appLocale as readonly string[]).includes(value);
}

export function localeCookieHeader(locale: AppLocale, maxAgeSeconds: number): string {
  const parts = [
    `${LOCALE_COOKIE}=${locale}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (import.meta.env.PROD) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function readLocaleFromCookieHeader(
  cookieHeader: string | null,
): AppLocale | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${LOCALE_COOKIE}=`));
  if (!match) return null;
  const value = match.split("=")[1]?.trim();
  return value && isAppLocale(value) ? value : null;
}
