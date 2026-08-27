import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

const POLL_MS = 30_000;

export function AdminPendingBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (document.visibilityState !== "visible") return;
      const res = await api<{ pendingCount: number }>(
        "/api/admin/pending-requests-count",
      );
      if (cancelled || !res.ok) return;
      setCount(res.data.pendingCount);
    }

    void load().catch(() => {});
    const id = setInterval(() => {
      void load().catch(() => {});
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void load().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (count <= 0) return null;

  return (
    <span
      className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground"
      aria-label={`${count} pending requests`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
