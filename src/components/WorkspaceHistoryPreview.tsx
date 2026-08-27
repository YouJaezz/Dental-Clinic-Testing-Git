import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type {
  PatientHistoryLine,
  PatientHistoryPayload,
  PatientHistoryVisitBlock,
} from "@/lib/patient-history";
import { formatManilaDateLong, toManilaDateKey } from "@/lib/manila-date";
import { workspaceQuery } from "@/lib/workspace-url";
import { formatVisitTicketNumber } from "@/lib/visit-ticket";
import { ExternalLink } from "lucide-react";

const MAX_PRIOR_VISITS = 6;
/** Fixed panel height — content scrolls inside; overview layout stays stable. */
const PANEL_HEIGHT_CLASS = "h-[17.5rem]";

function visitDateLabel(iso: string): string {
  try {
    const ymd = toManilaDateKey(new Date(iso));
    return formatManilaDateLong(ymd);
  } catch {
    return iso;
  }
}

function formatProcedureLine(line: PatientHistoryLine): string {
  let label = line.catalogName;
  if (line.quantity > 1) label += ` ×${line.quantity}`;
  if (line.procedureLevelLabelSnapshot) {
    label += ` (${line.procedureLevelLabelSnapshot})`;
  }
  if (line.toothNumbers && line.toothNumbers.length > 0) {
    label += ` — teeth ${line.toothNumbers.join(", ")}`;
  }
  if (line.voided) {
    label +=
      line.voidCategory === "REFUNDED" ? " [refunded]" : " [error]";
  }
  return label;
}

function PriorVisitRow(props: {
  block: PatientHistoryVisitBlock;
  showTicket: boolean;
}) {
  const { block } = props;
  const activeLines = block.procedureLines.filter((l) => !l.voided);
  const voidedLines = block.procedureLines.filter((l) => l.voided);

  return (
    <article className="border-b border-border/50 py-2 last:border-b-0 last:pb-0">
      <p className="text-xs font-semibold text-foreground">
        {props.showTicket && block.visit.ticketNumber >= 1 ? (
          <span className="mr-1.5 font-mono text-primary">
            {formatVisitTicketNumber(block.visit.ticketNumber)}
          </span>
        ) : null}
        {visitDateLabel(block.visit.visitDate)}
        <span className="ml-1.5 font-normal text-muted-foreground">
          · {block.visit.status === "OPEN" ? "Open" : "Closed"}
        </span>
      </p>

      {block.visit.notes?.trim() ? (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground/70">Notes: </span>
          {block.visit.notes.trim()}
        </p>
      ) : null}

      {activeLines.length > 0 ? (
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] leading-snug text-foreground">
          {activeLines.map((line) => (
            <li key={line.id}>
              <span>{formatProcedureLine(line)}</span>
              {line.lineNotes?.trim() ? (
                <span className="block pl-3 text-muted-foreground line-clamp-1">
                  {line.lineNotes.trim()}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : voidedLines.length === 0 ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">No procedures.</p>
      ) : null}

      {voidedLines.length > 0 ? (
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-muted-foreground">
          {voidedLines.map((line) => (
            <li key={line.id} className="line-through decoration-amber-800/40">
              {formatProcedureLine(line)}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

type Props = {
  patientId: string;
  /** Current visit in workspace — hidden from this quick view. */
  currentVisitId: string | null;
  showVisitTickets?: boolean;
};

export function WorkspaceHistoryPreview(props: Props) {
  const [history, setHistory] = useState<PatientHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await api<PatientHistoryPayload>(
      `/api/patients/${props.patientId}/history?limit=${MAX_PRIOR_VISITS + 2}`,
    );
    setLoading(false);
    if (!res.ok) {
      setHistory(null);
      setErr("Could not load visit history");
      return;
    }
    setHistory(res.data);
  }, [props.patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onQuery = () => void load();
    window.addEventListener("clinicalhub:query", onQuery);
    return () => window.removeEventListener("clinicalhub:query", onQuery);
  }, [load]);

  const priorVisits = useMemo(() => {
    if (!history) return [];
    return history.visits
      .filter((b) => b.visit.id !== props.currentVisitId)
      .slice(0, MAX_PRIOR_VISITS);
  }, [history, props.currentVisitId]);

  const priorVisitTotal =
    history?.totalVisitCount != null
      ? Math.max(
          0,
          history.totalVisitCount -
            (props.currentVisitId &&
            history.visits.some((b) => b.visit.id === props.currentVisitId)
              ? 1
              : 0),
        )
      : (history?.visits.filter((b) => b.visit.id !== props.currentVisitId)
          .length ?? 0);

  const recordHref = `/workspace/record${workspaceQuery(
    props.patientId,
    props.currentVisitId,
  )}`;

  return (
    <section
      className={`flex ${PANEL_HEIGHT_CLASS} min-h-0 flex-col overflow-hidden rounded-lg border-2 border-highlight/40 bg-card shadow-sm`}
      aria-labelledby="workspace-history-preview-title"
    >
      <header className="shrink-0 border-b border-border/60 bg-highlight/25 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2
              id="workspace-history-preview-title"
              className="truncate text-sm font-semibold text-foreground"
            >
              Prior visits
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">
              Procedures &amp; notes only — scroll for more
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            asChild
          >
            <a href={recordHref} className="inline-flex items-center gap-1">
              Record
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        {err ? (
          <p className="text-xs text-destructive" role="alert">
            {err}
          </p>
        ) : loading && !history ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : priorVisits.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {history && history.visits.length === 0
              ? "No visits on file yet."
              : props.currentVisitId
                ? "No prior visits on file."
                : "No prior visits to show."}
          </p>
        ) : (
          <>
            {priorVisits.map((block) => (
              <PriorVisitRow
                key={block.visit.id}
                block={block}
                showTicket={props.showVisitTickets === true}
              />
            ))}
            {priorVisitTotal > MAX_PRIOR_VISITS ? (
              <p className="pt-1 text-center text-[10px] text-muted-foreground">
                +{priorVisitTotal - MAX_PRIOR_VISITS} older — see{" "}
                <a
                  href={recordHref}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  Record
                </a>
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
