/** Philippines (Manila) calendar helpers for visit-date filters. */
const TZ = "Asia/Manila";

/** `yyyy-MM-dd` in Manila for an ISO timestamp. */
export function toManilaDateKey(isoOrMs: string | Date): string {
  const d = typeof isoOrMs === "string" ? new Date(isoOrMs) : isoOrMs;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Start/end instants (ms) for a Manila calendar `yyyy-MM-dd`. */
export function manilaDayBoundsMs(
  ymd: string,
): { startMs: number; endMs: number } | null {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const start = new Date(`${t}T00:00:00+08:00`);
  const end = new Date(`${t}T23:59:59.999+08:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function formatManilaDateLong(ymd: string): string {
  const d = new Date(`${ymd.trim()}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-PH", {
    timeZone: TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Inclusive Manila calendar year bounds for analytics (visit_date filtering). */
export function manilaYearBounds(year: number): { start: Date; end: Date } {
  const start = new Date(`${year}-01-01T00:00:00+08:00`);
  const end = new Date(`${year}-12-31T23:59:59.999+08:00`);
  return { start, end };
}

export function manilaCalendarYear(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
    }).format(d),
    10,
  );
}

/** 1–12: calendar month in Manila for an instant. */
export function manilaCalendarMonth(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      month: "numeric",
    }).format(d),
    10,
  );
}

export function manilaYearFromInstant(isoOrMs: string | Date): number {
  return parseInt(toManilaDateKey(isoOrMs).slice(0, 4), 10);
}

/** Manila calendar date `days` before `ymd` (negative `days` moves forward). */
export function manilaDateKeyAddDays(ymd: string, days: number): string {
  const d = new Date(`${ymd.trim()}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCDate(d.getUTCDate() + days);
  return toManilaDateKey(d);
}
