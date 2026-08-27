import { isNull } from "drizzle-orm";
import { visitProcedureLines } from "@/db/schema";

/** Active (non-voided) procedure lines — excluded from voided corrections. */
export function activeProcedureLine() {
  return isNull(visitProcedureLines.voidedAt);
}
