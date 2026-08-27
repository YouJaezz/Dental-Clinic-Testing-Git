/** Clinical tooth codes 1–88 (inclusive). */
export const TOOTH_MIN = 1;
export const TOOTH_MAX = 88;

export function parseToothNumber(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < TOOTH_MIN || n > TOOTH_MAX) return null;
  return n;
}

export function normalizeToothNumbers(
  inputs: string[],
): { numbers: number[]; error: string | null } {
  const seen = new Set<number>();
  const numbers: number[] = [];
  for (const s of inputs) {
    const t = s.trim();
    if (t === "") continue;
    const n = parseToothNumber(t);
    if (n === null) {
      return {
        numbers: [],
        error: `Each tooth must be a whole number from ${TOOTH_MIN} to ${TOOTH_MAX}.`,
      };
    }
    if (seen.has(n)) continue;
    seen.add(n);
    numbers.push(n);
  }
  numbers.sort((a, b) => a - b);
  return { numbers, error: null };
}

/** Parse stored JSON array of tooth numbers (1–88); invalid → null */
export function parseToothNumbersJson(
  raw: string | null | undefined,
): number[] | null {
  if (raw == null || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: number[] = [];
    for (const v of parsed) {
      if (typeof v !== "number" || !Number.isInteger(v)) return null;
      if (v < TOOTH_MIN || v > TOOTH_MAX) return null;
      out.push(v);
    }
    return [...new Set(out)].sort((a, b) => a - b);
  } catch {
    return null;
  }
}

export function serializeToothNumbers(numbers: number[]): string {
  return JSON.stringify(numbers);
}
