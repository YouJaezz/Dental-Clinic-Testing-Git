import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  reportDate: string;
};

function buildFilename(reportDate: string): string {
  return `daily-sales-report-${reportDate.replace(/-/g, "")}.pdf`;
}

export function DailySalesReportExport(props: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function downloadPdf() {
    const el = document.getElementById("daily-sales-report-document");
    if (!el) {
      setErr("Could not find the report on this page.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [10, 10, 12, 10],
          filename: buildFilename(props.reportDate),
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        })
        .from(el)
        .save();
    } catch {
      setErr("Could not create PDF. Try Print and save as PDF instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => void downloadPdf()}
      >
        {busy ? "Creating PDF…" : "Download PDF"}
      </Button>
      {err ? (
        <p className="max-w-xs text-xs text-destructive" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
