import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { formatManilaDateLong } from "@/lib/manila-date";

type Stats = {
  totalCount: number;
  addedTodayCount: number;
  todayKey: string;
};

export function PatientRegistryStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const pollMs = 15_000;

    async function load() {
      if (document.visibilityState !== "visible") return;
      const res = await api<Stats>("/api/patients/count");
      if (cancelled || !res.ok) return;
      setStats(res.data);
    }

    void load().catch(() => {});
    const id = setInterval(() => {
      void load().catch(() => {});
    }, pollMs);
    const onVis = () => {
      if (document.visibilityState === "visible") void load().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("clinicalhub:patient-updated", onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("clinicalhub:patient-updated", onVis);
    };
  }, []);

  if (stats == null) return null;

  const todayLabel = formatManilaDateLong(stats.todayKey);

  return (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
      <p>
        <span className="font-semibold tabular-nums text-foreground">
          {stats.totalCount.toLocaleString()}
        </span>{" "}
        {stats.totalCount === 1 ? "patient" : "patients"} registered
      </p>
      <p>
        <span
          className={
            stats.addedTodayCount > 0
              ? "font-semibold tabular-nums text-primary"
              : "font-semibold tabular-nums text-foreground"
          }
        >
          {stats.addedTodayCount.toLocaleString()}
        </span>{" "}
        new {stats.addedTodayCount === 1 ? "patient" : "patients"} today
        <span className="block text-[10px] leading-tight opacity-80">
          {todayLabel}
        </span>
      </p>
    </div>
  );
}
