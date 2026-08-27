import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { Visit } from "@/lib/clinical-types";
import {
  getLocationSearch,
  parseWorkspaceQuery,
  replaceUrlQuery,
} from "@/lib/workspace-url";

export type WorkspaceContext = {
  patientId: string | null;
  visitId: string | null;
  /** True while resolving a default visit when only patientId is in the URL. */
  resolving: boolean;
};

function pickDefaultVisitId(visits: Visit[], preferredId: string | null): string | null {
  if (preferredId && visits.some((v) => v.id === preferredId)) {
    return preferredId;
  }
  return (
    visits.find((v) => v.status === "OPEN")?.id ?? visits[0]?.id ?? null
  );
}

/**
 * Keeps patient + visit in sync with the URL across workspace tabs.
 * If the URL has patientId but no visitId, loads visits and picks the open
 * (or latest) visit — same behavior as Overview.
 */
export function useWorkspaceContext(): WorkspaceContext {
  const [ctx, setCtx] = useState<WorkspaceContext>({
    patientId: null,
    visitId: null,
    resolving: false,
  });

  const sync = useCallback(async () => {
    if (typeof window === "undefined") return;

    const { patientId, visitId: urlVisitId } = parseWorkspaceQuery(
      getLocationSearch(),
    );

    if (!patientId) {
      setCtx({ patientId: null, visitId: null, resolving: false });
      return;
    }

    if (urlVisitId) {
      setCtx({ patientId, visitId: urlVisitId, resolving: false });
      return;
    }

    setCtx({ patientId, visitId: null, resolving: true });
    const res = await api<{ visits: Visit[] }>(
      `/api/patients/${patientId}/visits`,
    );
    if (!res.ok) {
      setCtx({ patientId, visitId: null, resolving: false });
      return;
    }

    const list = res.data.visits.map((v) => ({
      ...v,
      visitDate:
        typeof v.visitDate === "string"
          ? v.visitDate
          : new Date(v.visitDate as unknown as number).toISOString(),
    }));
    const nextVisitId = pickDefaultVisitId(list, null);
    setCtx({ patientId, visitId: nextVisitId, resolving: false });

    if (nextVisitId) {
      replaceUrlQuery(window.location.pathname, patientId, nextVisitId);
    }
  }, []);

  useEffect(() => {
    void sync();
    const onQ = () => void sync();
    window.addEventListener("popstate", onQ);
    window.addEventListener("clinicalhub:query", onQ);
    return () => {
      window.removeEventListener("popstate", onQ);
      window.removeEventListener("clinicalhub:query", onQ);
    };
  }, [sync]);

  return ctx;
}
