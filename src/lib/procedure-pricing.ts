import type { ProcedurePricingMode } from "@/db/schema.shared";
import { z } from "zod";

const tierSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1),
  unitPriceCents: z.number().int().nonnegative(),
});

export type ProcedureLevelTier = z.infer<typeof tierSchema>;

const tiersSchema = z.array(tierSchema);

export function parseLevelPricesJson(
  raw: string | null | undefined,
): ProcedureLevelTier[] | null {
  if (raw == null || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const r = tiersSchema.safeParse(parsed);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function serializeLevelPrices(tiers: ProcedureLevelTier[]): string {
  return JSON.stringify(tiers);
}

export function ensureTierIds(
  tiers: Array<{ id?: string; label: string; unitPriceCents: number }>,
): ProcedureLevelTier[] {
  return tiers.map((t) => ({
    id: t.id?.trim() || crypto.randomUUID(),
    label: t.label.trim(),
    unitPriceCents: t.unitPriceCents,
  }));
}

export function findTierById(
  tiers: ProcedureLevelTier[],
  id: string,
): ProcedureLevelTier | undefined {
  return tiers.find((t) => t.id === id);
}

/** Catalog stores a unit price (not level tiers or manual visit price). */
export function catalogHasUnitPrice(mode: ProcedurePricingMode): boolean {
  return mode === "FIXED" || mode === "PER_UNIT";
}

/** Visit must enter quantity when adding this procedure (e.g. zirconia units). */
export function catalogRequiresQuantity(mode: ProcedurePricingMode): boolean {
  return mode === "PER_UNIT";
}
