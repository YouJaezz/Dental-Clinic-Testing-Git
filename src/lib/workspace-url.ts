/** Current URL search on the client; empty during SSR. */
export function getLocationSearch(): string {
  if (typeof window === "undefined") return "";
  return window.location.search;
}

/** Build query string for workspace routes (patient + visit context). */
export function workspaceQuery(
  patientId: string | null,
  visitId: string | null,
): string {
  const p = new URLSearchParams();
  if (patientId) p.set("patientId", patientId);
  if (visitId) p.set("visitId", visitId);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function replaceUrlQuery(
  pathname: string,
  patientId: string | null,
  visitId: string | null,
) {
  if (typeof window === "undefined") return;
  const qs = workspaceQuery(patientId, visitId);
  window.history.replaceState({}, "", `${pathname}${qs}`);
  window.dispatchEvent(new Event("clinicalhub:query"));
}


export function parseWorkspaceQuery(search: string): {
  patientId: string | null;
  visitId: string | null;
} {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    patientId: p.get("patientId") || null,
    visitId: p.get("visitId") || null,
  };
}
