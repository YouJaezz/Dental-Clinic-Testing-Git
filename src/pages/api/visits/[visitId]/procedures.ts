import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { activeProcedureLine } from "@/lib/procedure-line-filters";
import { z } from "zod";
import { db } from "@/db/client";
import { procedureCatalog, visitProcedureLines, visits } from "@/db/schema";
import { listPendingLineIdsForVisit } from "@/lib/correction-requests-query";
import { isMissingSchemaError, MIGRATION_HINT } from "@/lib/db-errors";
import { catalogRowToItem } from "@/lib/catalog-dto";
import { findTierById, parseLevelPricesJson } from "@/lib/procedure-pricing";
import { auditActorFromLocals, recordAudit } from "@/lib/audit-log";
import {
  canMutateClinicalData,
  canReadClinicalData,
  forbidUnless,
} from "@/lib/authz";
import { json } from "@/lib/http-api";
import {
  parseToothNumbersJson,
  serializeToothNumbers,
} from "@/lib/teeth";

function snapshotLineNotes(input: string | null | undefined): string | null {
  const t = input?.trim();
  return t ? t : null;
}

type LineRow = typeof visitProcedureLines.$inferSelect;

function procedureLineDto(row: LineRow) {
  const created = row.createdAt;
  return {
    id: row.id,
    visitId: row.visitId,
    catalogId: row.catalogId,
    quantity: row.quantity,
    unitPriceCentsSnapshot: row.unitPriceCentsSnapshot,
    lineTotalCents: row.lineTotalCents,
    procedureLevelLabelSnapshot: row.procedureLevelLabelSnapshot,
    toothNumbers: parseToothNumbersJson(row.toothNumbersJson),
    lineNotes: row.lineNotes,
    createdAt:
      created instanceof Date ? created.toISOString() : String(created),
  };
}

export const GET: APIRoute = async ({ params, locals }) => {
  const denied = forbidUnless(canReadClinicalData(locals.userRole));
  if (denied) return denied;

  const visitId = params.visitId;
  if (!visitId) return json({ error: "Missing visitId" }, { status: 400 });

  try {
  const v = await db
    .select({ id: visits.id, status: visits.status })
    .from(visits)
    .where(eq(visits.id, visitId))
    .limit(1);
  if (!v[0]) return json({ error: "Not found" }, { status: 404 });

  const catalog = await db
    .select()
    .from(procedureCatalog)
    .where(eq(procedureCatalog.active, true))
    .orderBy(procedureCatalog.name);

  const lineSelect = {
    id: visitProcedureLines.id,
    visitId: visitProcedureLines.visitId,
    catalogId: visitProcedureLines.catalogId,
    quantity: visitProcedureLines.quantity,
    unitPriceCentsSnapshot: visitProcedureLines.unitPriceCentsSnapshot,
    lineTotalCents: visitProcedureLines.lineTotalCents,
    procedureLevelLabelSnapshot:
      visitProcedureLines.procedureLevelLabelSnapshot,
    toothNumbersJson: visitProcedureLines.toothNumbersJson,
    lineNotes: visitProcedureLines.lineNotes,
    createdAt: visitProcedureLines.createdAt,
    catalogName: procedureCatalog.name,
    catalogCode: procedureCatalog.code,
  };

  let lines;
  try {
    lines = await db
      .select(lineSelect)
      .from(visitProcedureLines)
      .innerJoin(
        procedureCatalog,
        eq(visitProcedureLines.catalogId, procedureCatalog.id),
      )
      .where(
        and(eq(visitProcedureLines.visitId, visitId), activeProcedureLine()),
      )
      .orderBy(desc(visitProcedureLines.createdAt));
  } catch (lineErr) {
    if (!isMissingSchemaError(lineErr)) throw lineErr;
    lines = await db
      .select(lineSelect)
      .from(visitProcedureLines)
      .innerJoin(
        procedureCatalog,
        eq(visitProcedureLines.catalogId, procedureCatalog.id),
      )
      .where(eq(visitProcedureLines.visitId, visitId))
      .orderBy(desc(visitProcedureLines.createdAt));
  }

  const linesPayload = lines.map((row) => ({
    id: row.id,
    visitId: row.visitId,
    catalogId: row.catalogId,
    quantity: row.quantity,
    unitPriceCentsSnapshot: row.unitPriceCentsSnapshot,
    lineTotalCents: row.lineTotalCents,
    procedureLevelLabelSnapshot: row.procedureLevelLabelSnapshot,
    toothNumbers: parseToothNumbersJson(row.toothNumbersJson),
    lineNotes: row.lineNotes,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    catalogName: row.catalogName,
    catalogCode: row.catalogCode,
  }));

  const pendingRequestLineIds = await listPendingLineIdsForVisit(visitId);

  return json({
    catalog: catalog.map(catalogRowToItem),
    lines: linesPayload,
    visitStatus: v[0].status,
    pendingRequestLineIds,
  });
  } catch (e) {
    console.error("[visits/procedures GET]", e);
    if (isMissingSchemaError(e)) {
      return json({ error: MIGRATION_HINT }, { status: 503 });
    }
    return json({ error: "Could not load procedures" }, { status: 500 });
  }
};

const lineSchema = z.object({
  catalogId: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  manualUnitPriceCents: z.number().int().nonnegative().optional(),
  toothNumbers: z.array(z.number().int().min(1).max(88)).max(88).optional(),
  procedureLevelId: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(8000).optional().nullable(),
});

const postSchema = z.object({
  lines: z.array(lineSchema).min(1),
});

export const POST: APIRoute = async ({ params, request, locals }) => {
  const denied = forbidUnless(canMutateClinicalData(locals.userRole));
  if (denied) return denied;

  const visitId = params.visitId;
  if (!visitId) return json({ error: "Missing visitId" }, { status: 400 });

  const visitRow = await db
    .select()
    .from(visits)
    .where(eq(visits.id, visitId))
    .limit(1);
  if (!visitRow[0]) return json({ error: "Not found" }, { status: 404 });
  if (visitRow[0].status === "CLOSED") {
    return json({ error: "Visit is closed" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let inserted: LineRow[];
  try {
    inserted = await db.transaction(async (tx) => {
      const out: LineRow[] = [];
      for (const line of parsed.data.lines) {
        const lineNotes = snapshotLineNotes(line.notes);
        const cat = await tx
          .select()
          .from(procedureCatalog)
          .where(eq(procedureCatalog.id, line.catalogId))
          .limit(1);
        const c = cat[0];
        if (!c || !c.active) {
          throw new Error(`Unknown or inactive catalog id: ${line.catalogId}`);
        }
        const mode = c.pricingMode;

        if (mode === "MANUAL") {
          if (line.manualUnitPriceCents === undefined) {
            throw new Error(
              `manualUnitPriceCents required for MANUAL catalog: ${line.catalogId}`,
            );
          }
          const teeth = line.toothNumbers ?? [];
          const unique = [...new Set(teeth)].sort((a, b) => a - b);
          if (unique.length === 0) {
            throw new Error(
              `toothNumbers required (at least one tooth 1–88) for MANUAL catalog: ${line.catalogId}`,
            );
          }
          if (line.quantity !== undefined) {
            throw new Error(
              `quantity must not be sent for MANUAL catalog lines: ${line.catalogId}`,
            );
          }
          if (line.procedureLevelId) {
            throw new Error(
              `procedureLevelId must not be set for MANUAL catalog: ${line.catalogId}`,
            );
          }
          const unit = line.manualUnitPriceCents;
          const lineTotal = unit;
          const rows = await tx
            .insert(visitProcedureLines)
            .values({
              visitId,
              catalogId: line.catalogId,
              quantity: 1,
              unitPriceCentsSnapshot: unit,
              lineTotalCents: lineTotal,
              procedureLevelIdSnapshot: null,
              procedureLevelLabelSnapshot: null,
              toothNumbersJson: serializeToothNumbers(unique),
              lineNotes,
            })
            .returning();
          const row = rows[0];
          if (!row) throw new Error("Insert did not return a row");
          out.push(row);
        } else if (mode === "BY_LEVEL") {
          const tiers = parseLevelPricesJson(c.levelPricesJson) ?? [];
          const q = line.quantity ?? 1;
          if (q < 1) {
            throw new Error(`quantity must be at least 1 for BY_LEVEL catalog: ${line.catalogId}`);
          }
          if (!line.procedureLevelId) {
            throw new Error(
              `procedureLevelId required for BY_LEVEL catalog: ${line.catalogId}`,
            );
          }
          if (line.manualUnitPriceCents !== undefined) {
            throw new Error(
              `manualUnitPriceCents must not be set for BY_LEVEL catalog: ${line.catalogId}`,
            );
          }
          if (line.toothNumbers !== undefined && line.toothNumbers.length > 0) {
            throw new Error(
              `toothNumbers must not be set for BY_LEVEL catalog: ${line.catalogId}`,
            );
          }
          const tier = findTierById(tiers, line.procedureLevelId);
          if (!tier) {
            throw new Error(`Unknown procedure level for catalog: ${line.catalogId}`);
          }
          const unit = tier.unitPriceCents;
          const lineTotal = unit * q;
          const rows = await tx
            .insert(visitProcedureLines)
            .values({
              visitId,
              catalogId: line.catalogId,
              quantity: q,
              unitPriceCentsSnapshot: unit,
              lineTotalCents: lineTotal,
              procedureLevelIdSnapshot: tier.id,
              procedureLevelLabelSnapshot: tier.label,
              toothNumbersJson: null,
              lineNotes,
            })
            .returning();
          const row = rows[0];
          if (!row) throw new Error("Insert did not return a row");
          out.push(row);
        } else if (mode === "PER_UNIT") {
          if (line.quantity === undefined) {
            throw new Error(
              `quantity is required for PER_UNIT catalog: ${line.catalogId}`,
            );
          }
          const q = line.quantity;
          if (q < 1) {
            throw new Error(
              `quantity must be at least 1 for PER_UNIT catalog: ${line.catalogId}`,
            );
          }
          if (line.manualUnitPriceCents !== undefined) {
            throw new Error(
              `manualUnitPriceCents must not be set for PER_UNIT catalog: ${line.catalogId}`,
            );
          }
          if (line.toothNumbers !== undefined && line.toothNumbers.length > 0) {
            throw new Error(
              `toothNumbers must not be set for PER_UNIT catalog: ${line.catalogId}`,
            );
          }
          if (line.procedureLevelId) {
            throw new Error(
              `procedureLevelId must not be set for PER_UNIT catalog: ${line.catalogId}`,
            );
          }
          const unit = c.unitPriceCents;
          const lineTotal = unit * q;
          const rows = await tx
            .insert(visitProcedureLines)
            .values({
              visitId,
              catalogId: line.catalogId,
              quantity: q,
              unitPriceCentsSnapshot: unit,
              lineTotalCents: lineTotal,
              procedureLevelIdSnapshot: null,
              procedureLevelLabelSnapshot: null,
              toothNumbersJson: null,
              lineNotes,
            })
            .returning();
          const row = rows[0];
          if (!row) throw new Error("Insert did not return a row");
          out.push(row);
        } else {
          const q = line.quantity ?? 1;
          if (q < 1) {
            throw new Error(`quantity must be at least 1 for FIXED catalog: ${line.catalogId}`);
          }
          if (line.manualUnitPriceCents !== undefined) {
            throw new Error(
              `manualUnitPriceCents must not be set for FIXED catalog: ${line.catalogId}`,
            );
          }
          if (line.toothNumbers !== undefined && line.toothNumbers.length > 0) {
            throw new Error(
              `toothNumbers must not be set for FIXED catalog: ${line.catalogId}`,
            );
          }
          if (line.procedureLevelId) {
            throw new Error(
              `procedureLevelId must not be set for FIXED catalog: ${line.catalogId}`,
            );
          }
          const unit = c.unitPriceCents;
          const lineTotal = unit * q;
          const rows = await tx
            .insert(visitProcedureLines)
            .values({
              visitId,
              catalogId: line.catalogId,
              quantity: q,
              unitPriceCentsSnapshot: unit,
              lineTotalCents: lineTotal,
              procedureLevelIdSnapshot: null,
              procedureLevelLabelSnapshot: null,
              toothNumbersJson: null,
              lineNotes,
            })
            .returning();
          const row = rows[0];
          if (!row) throw new Error("Insert did not return a row");
          out.push(row);
        }
      }
      return out;
    });
  } catch (e) {
    console.error("[visit procedures POST] transaction failed:", e);
    return json({ error: "Could not save procedures" }, { status: 400 });
  }

  await recordAudit(auditActorFromLocals(locals), {
    action: "procedure.added",
    entityType: "visit",
    entityId: visitId,
    summary: `Added ${inserted.length} procedure line(s) to visit ${visitId}`,
    details: { lineCount: inserted.length },
  });

  try {
    const linesPayload = inserted.map(procedureLineDto);
    return json({ lines: linesPayload }, { status: 201 });
  } catch (e) {
    console.error(
      "[visit procedures POST] response serialization failed (data may be committed):",
      e,
    );
    return json(
      {
        error: "Saved but response failed; refresh the page to see new lines.",
      },
      { status: 500 },
    );
  }
};
