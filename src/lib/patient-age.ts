import { toManilaDateKey } from "@/lib/manila-date";

/** Manila-local calendar age from birth instant (birthday not yet reached this year → −1). */
export function computeAgeFromBirthMs(birthMs: number): number {
  const birthKey = toManilaDateKey(new Date(birthMs));
  const todayKey = toManilaDateKey(new Date());
  const [by, bm, bd] = birthKey.split("-").map(Number);
  const [ty, tm, td] = todayKey.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

/** Parse `yyyy-MM-dd` as a Manila calendar date → UTC ms (noon Manila). */
export function parseManilaBirthDateYmdToUtcMs(ymd: string): number | null {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = new Date(`${t}T12:00:00+08:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function birthMsToManilaYmd(birthMs: number): string {
  return toManilaDateKey(new Date(birthMs));
}

/** Error message or null if OK. */
export function validateBirthDateMs(ms: number): string | null {
  const todayEnd = new Date(
    `${toManilaDateKey(new Date())}T23:59:59.999+08:00`,
  ).getTime();
  if (ms > todayEnd) return "Date of birth cannot be in the future";
  const age = computeAgeFromBirthMs(ms);
  if (age < 0) return "Invalid date of birth";
  if (age > 130) return "Date of birth seems invalid";
  return null;
}

/**
 * Legacy rows may only have `age`. Estimate a Manila calendar DOB using today's
 * month/day so `computeAgeFromBirthMs` matches the stored age.
 */
export function estimateManilaBirthYmdFromAge(age: number): string | null {
  if (!Number.isFinite(age) || age < 0 || age > 130) return null;
  const todayKey = toManilaDateKey(new Date());
  const birthYear = Number.parseInt(todayKey.slice(0, 4), 10) - age;
  return `${birthYear}-${todayKey.slice(5)}`;
}

export type PatientDobDisplay = {
  ymd: string | null;
  /** True when derived from stored age because date_of_birth is missing */
  isEstimated: boolean;
};

export function resolvePatientDateOfBirthDisplay(
  dateOfBirth: string | null | undefined,
  age: number | null | undefined,
): PatientDobDisplay {
  const stored = dateOfBirth?.trim();
  if (stored) return { ymd: stored, isEstimated: false };
  if (age != null) {
    const ymd = estimateManilaBirthYmdFromAge(age);
    if (ymd) return { ymd, isEstimated: true };
  }
  return { ymd: null, isEstimated: false };
}
