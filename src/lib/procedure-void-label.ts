import type { ProcedureVoidCategory } from "@/db/schema.shared";

const ERROR_PREFIX = "[ERROR] ";
const REFUNDED_PREFIX = "[REFUNDED] ";

export function formatVoidReason(
  category: ProcedureVoidCategory,
  note?: string,
): string {
  const trimmed = note?.trim() ?? "";
  const prefix = category === "REFUNDED" ? REFUNDED_PREFIX : ERROR_PREFIX;
  if (trimmed) return `${prefix}${trimmed}`;
  return category === "REFUNDED"
    ? `${REFUNDED_PREFIX}Recorded as refunded — excluded from visit totals; payments unchanged.`
    : `${ERROR_PREFIX}Recorded in error — excluded from visit totals; payments unchanged.`;
}

export function parseVoidCategory(
  voidReason: string | null | undefined,
  voidCategoryColumn?: string | null,
): ProcedureVoidCategory | null {
  if (voidCategoryColumn === "REFUNDED" || voidCategoryColumn === "ERROR") {
    return voidCategoryColumn;
  }
  if (!voidReason) return null;
  if (voidReason.startsWith(REFUNDED_PREFIX)) return "REFUNDED";
  if (voidReason.startsWith(ERROR_PREFIX)) return "ERROR";
  return "ERROR";
}

export function voidCategoryLabel(
  category: ProcedureVoidCategory | null,
): string {
  if (category === "REFUNDED") return "refunded";
  if (category === "ERROR") return "error";
  return "error";
}
