import type {
  PatientHistoryPayload,
  PatientHistoryVisitBlock,
} from "@/lib/patient-history";
import {
  formatManilaDateLong,
  manilaDayBoundsMs,
  toManilaDateKey,
} from "@/lib/manila-date";

export function totalsForVisits(blocks: PatientHistoryVisitBlock[]) {
  let chargesCents = 0;
  let paidCents = 0;
  for (const b of blocks) {
    chargesCents += b.summary.chargesCents;
    paidCents += b.summary.paidCents;
  }
  return {
    chargesCents,
    paidCents,
    balanceCents: chargesCents - paidCents,
  };
}

export function filterPatientHistoryForPrint(
  data: PatientHistoryPayload,
  rangeRawInput: string,
) {
  const rangeRaw = rangeRawInput.trim() || "all";
  const visitDateOptions = [
    ...new Set(
      data.visits.map((v) => toManilaDateKey(v.visit.visitDate)),
    ),
  ].sort((a, b) => b.localeCompare(a));

  let visitsShown = data.visits;
  let scopeDescription =
    "Full patient history — all visits (Manila calendar dates).";
  let invalidRange = false;

  if (rangeRaw !== "all") {
    const bounds = manilaDayBoundsMs(rangeRaw);
    if (bounds) {
      visitsShown = data.visits.filter((block) => {
        const t = new Date(block.visit.visitDate).getTime();
        return t >= bounds.startMs && t <= bounds.endMs;
      });
      scopeDescription = `Visits on ${formatManilaDateLong(rangeRaw)} only (Manila date).`;
    } else {
      invalidRange = true;
      visitsShown = data.visits;
      scopeDescription =
        "Invalid date selection — showing all visits. Choose a date from the list.";
    }
  }

  return {
    rangeRaw,
    visitDateOptions,
    visitsShown,
    scopeDescription,
    invalidRange,
    totalsShown: totalsForVisits(visitsShown),
  };
}
