/** Display amounts in Philippine peso (minor units = centavos). */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Parse user-entered peso amount string → centavos. */
export function pesoStringToCents(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** @deprecated use pesoStringToCents */
export const dollarsToCents = pesoStringToCents;
