export function formatVisitTicketNumber(
  ticketNumber: number | null | undefined,
): string {
  if (ticketNumber == null || ticketNumber < 1) return "—";
  return `#${ticketNumber.toLocaleString("en-US")}`;
}

/** Parse `#1042`, `1042`, etc. */
export function parseVisitTicketQuery(raw: string): number | null {
  const t = raw.trim().replace(/^#/, "").replace(/,/g, "");
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n) || n < 1 || n > 999_999_999) return null;
  return n;
}

export function formatVisitSelectLabel(input: {
  ticketNumber: number | null | undefined;
  visitDate: string;
  status: "OPEN" | "CLOSED" | string;
  showTicket: boolean;
}): string {
  const dateLabel = new Date(input.visitDate).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const statusLabel = input.status === "OPEN" ? "Open" : "Closed";
  if (
    !input.showTicket ||
    input.ticketNumber == null ||
    input.ticketNumber < 1
  ) {
    return `${dateLabel} — ${statusLabel}`;
  }
  return `${formatVisitTicketNumber(input.ticketNumber)} · ${dateLabel} — ${statusLabel}`;
}

export type VisitTicketLookupResult = {
  visitId: string;
  ticketNumber: number;
  visitDate: string;
  status: "OPEN" | "CLOSED";
  patientId: string;
  patientName: string;
  contactNumber: string | null;
};
