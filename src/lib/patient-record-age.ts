/** Elapsed-time label for when a patient record was created (24h buckets). */
export function formatPatientRecordAge(
  createdAt: string | Date | number,
  nowMs: number = Date.now(),
): string {
  const ms =
    typeof createdAt === "number"
      ? createdAt
      : createdAt instanceof Date
        ? createdAt.getTime()
        : Date.parse(createdAt);
  if (!Number.isFinite(ms)) return "—";

  const elapsed = Math.max(0, nowMs - ms);
  const dayMs = 86_400_000;
  const days = Math.floor(elapsed / dayMs);

  if (days === 0) return "New record";
  if (days === 1) return "1 day old";
  if (days < 7) return `${days} days old`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week old" : `${weeks} weeks old`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? "1 month old" : `${months} months old`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year old" : `${years} years old`;
}

/** Badge tone for list UI. */
export function patientRecordAgeTone(
  createdAt: string | Date | number,
  nowMs: number = Date.now(),
): "new" | "recent" | "older" {
  const ms =
    typeof createdAt === "number"
      ? createdAt
      : createdAt instanceof Date
        ? createdAt.getTime()
        : Date.parse(createdAt);
  if (!Number.isFinite(ms)) return "older";
  const days = Math.floor(Math.max(0, nowMs - ms) / 86_400_000);
  if (days === 0) return "new";
  if (days < 7) return "recent";
  return "older";
}
