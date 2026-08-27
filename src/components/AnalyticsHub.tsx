import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { Role } from "@/lib/clinical-types";
import { formatCents } from "@/lib/money";

type YearListRes = {
  availableYears: number[];
};

type AnalyticsPayload = YearListRes & {
  year: number;
  timezone: string;
  uniquePatientsInYear: number;
  visitCountInYear: number;
  ageDistribution: { label: string; count: number }[];
  genderDistribution: { label: string; count: number }[];
  civilStatusDistribution: { label: string; count: number }[];
  monthly: {
    month: number;
    monthLabel: string;
    visitCount: number;
    chargesCents: number;
    collectedCents: number;
  }[];
  yearTotals: {
    chargesCents: number;
    collectedCents: number;
    balanceCents: number;
  };
};

export function AnalyticsHub(props: { initialRole: Role }) {
  void props.initialRole;
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingYears(true);
      setErr(null);
      const res = await api<YearListRes>("/api/analytics");
      if (cancelled) return;
      setLoadingYears(false);
      if (!res.ok) {
        setErr("Could not load analytics years");
        return;
      }
      setAvailableYears(res.data.availableYears);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadReport = useCallback(async (year: string) => {
    if (!year) {
      setData(null);
      return;
    }
    setLoadingReport(true);
    setErr(null);
    const res = await api<AnalyticsPayload>(`/api/analytics?year=${encodeURIComponent(year)}`);
    setLoadingReport(false);
    if (!res.ok) {
      setData(null);
      setErr(
        (res.data as { error?: string }).error ?? "Could not load analytics",
      );
      return;
    }
    setData(res.data);
  }, []);

  useEffect(() => {
    if (!selectedYear) {
      setData(null);
      return;
    }
    void loadReport(selectedYear);
  }, [selectedYear, loadReport]);

  const maxVisits = data
    ? Math.max(1, ...data.monthly.map((m) => m.visitCount))
    : 1;
  const maxCharges = data
    ? Math.max(1, ...data.monthly.map((m) => m.chargesCents))
    : 1;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Performance is shown per <strong>calendar year</strong> using{" "}
        <strong>Philippines (Manila)</strong> dates on each visit. Each year is
        its own view (nothing carries over in the report). Choose a year to
        load demographics and monthly totals for visits in that year only.
      </p>

      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4">
        <div className="space-y-2">
          <Label htmlFor="perf-year">Performance year</Label>
          <select
            id="perf-year"
            className="h-10 min-w-[12rem] rounded-md border bg-background px-3 text-sm"
            disabled={loadingYears}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="">— Select year —</option>
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {selectedYear ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loadingReport}
            onClick={() => void loadReport(selectedYear)}
          >
            Refresh
          </Button>
        ) : null}
      </div>

      {!selectedYear ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Select a performance year above to see age, gender, civil status, and
          monthly analytics for that year.
        </p>
      ) : loadingReport ? (
        <p className="text-sm text-muted-foreground">Loading report…</p>
      ) : data ? (
        <>
          <section className="rounded-md border bg-card p-4">
            <h2 className="mb-2 text-base font-semibold">
              Year {data.year} summary
            </h2>
            <p className="text-sm text-muted-foreground">
              Time zone: {data.timezone} · Unique patients with visits:{" "}
              <strong className="text-foreground">{data.uniquePatientsInYear}</strong>{" "}
              · Visits:{" "}
              <strong className="text-foreground">{data.visitCountInYear}</strong>
            </p>
            <p className="mt-2 text-sm">
              Charges:{" "}
              <strong>{formatCents(data.yearTotals.chargesCents)}</strong> ·
              Collected:{" "}
              <strong>{formatCents(data.yearTotals.collectedCents)}</strong> ·
              Balance:{" "}
              <strong>{formatCents(data.yearTotals.balanceCents)}</strong>
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <section className="rounded-md border">
              <div className="border-b bg-muted/40 px-4 py-2">
                <h3 className="text-sm font-semibold">Age (patients seen)</h3>
                <p className="text-xs text-muted-foreground">
                  Count of distinct patients with at least one visit in {data.year},
                  by age on file.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Age</TableHead>
                    <TableHead className="text-right">Patients</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ageDistribution.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground">
                        No patients in range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.ageDistribution.map((row) => (
                      <TableRow key={row.label}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </section>

            <section className="rounded-md border">
              <div className="border-b bg-muted/40 px-4 py-2">
                <h3 className="text-sm font-semibold">Gender (patients seen)</h3>
                <p className="text-xs text-muted-foreground">
                  Same patient cohort as age table.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gender</TableHead>
                    <TableHead className="text-right">Patients</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.genderDistribution.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground">
                        No data.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.genderDistribution.map((row) => (
                      <TableRow key={row.label}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </section>

            <section className="rounded-md border">
              <div className="border-b bg-muted/40 px-4 py-2">
                <h3 className="text-sm font-semibold">Civil status (patients seen)</h3>
                <p className="text-xs text-muted-foreground">
                  Same patient cohort as age and gender tables.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Civil status</TableHead>
                    <TableHead className="text-right">Patients</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.civilStatusDistribution.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground">
                        No data.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.civilStatusDistribution.map((row) => (
                      <TableRow key={row.label}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </section>
          </div>

          <section className="rounded-md border">
            <div className="border-b bg-muted/40 px-4 py-2">
              <h3 className="text-sm font-semibold">Monthly performance</h3>
              <p className="text-xs text-muted-foreground">
                Visits and revenue attributed to each visit&apos;s date (Manila
                month). Collected = completed payments linked to those visits.
              </p>
            </div>
            <div className="overflow-x-auto p-4">
              <div className="mb-6 flex h-40 items-end gap-1 border-b pb-1">
                {data.monthly.map((m) => (
                  <div
                    key={m.month}
                    className="flex min-w-[1.75rem] flex-1 flex-col items-center gap-1"
                    title={`${m.monthLabel}: ${m.visitCount} visits`}
                  >
                    <div
                      className="w-full max-w-[2rem] rounded-t bg-primary/80"
                      style={{
                        height: `${(m.visitCount / maxVisits) * 100}%`,
                        minHeight: m.visitCount > 0 ? "4px" : "0",
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {m.monthLabel}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mb-4 flex h-40 items-end gap-1 border-b pb-1">
                {data.monthly.map((m) => (
                  <div
                    key={`c-${m.month}`}
                    className="flex min-w-[1.75rem] flex-1 flex-col items-center gap-1"
                    title={`${m.monthLabel}: ${formatCents(m.chargesCents)} charges`}
                  >
                    <div
                      className="w-full max-w-[2rem] rounded-t bg-muted-foreground/50"
                      style={{
                        height: `${(m.chargesCents / maxCharges) * 100}%`,
                        minHeight: m.chargesCents > 0 ? "4px" : "0",
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {m.monthLabel}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                Bars: visits (accent) · charges (gray), scaled separately per row.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Charges</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Month balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.monthly.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>
                        {m.monthLabel} {data.year}
                      </TableCell>
                      <TableCell className="text-right">{m.visitCount}</TableCell>
                      <TableCell className="text-right">
                        {formatCents(m.chargesCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(m.collectedCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(m.chargesCents - m.collectedCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
