import type { procedureCatalog } from "@/db/schema";
import type { CatalogItem } from "@/lib/clinical-types";
import { parseLevelPricesJson } from "@/lib/procedure-pricing";

type CatalogRow = typeof procedureCatalog.$inferSelect;

export function catalogRowToItem(row: CatalogRow): CatalogItem {
  const mode = (row.pricingMode ?? "FIXED") as CatalogItem["pricingMode"];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    unitPriceCents: row.unitPriceCents,
    active: row.active,
    pricingMode: mode,
    levelPrices: parseLevelPricesJson(row.levelPricesJson) ?? [],
    dentistNotes: row.dentistNotes,
  };
}
