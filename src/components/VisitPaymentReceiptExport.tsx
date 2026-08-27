import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  patientFirstName: string;
  patientLastName: string;
  visitDateYmd: string;
};

function buildFilename(first: string, last: string, visitDateYmd: string): string {
  const safe = (s: string) =>
    s
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9-_]/g, "");
  const name = `${safe(last)}-${safe(first)}` || "patient";
  const d = visitDateYmd.replace(/-/g, "");
  return `${name}-visit-statement-${d}.pdf`;
}

export function VisitPaymentReceiptExport(props: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function downloadPdf() {
    const el = document.getElementById("visit-payment-receipt-document");
    if (!el) {
      setErr("Could not find the receipt on this page.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [10, 10, 12, 10],
          filename: buildFilename(
            props.patientFirstName,
            props.patientLastName,
            props.visitDateYmd,
          ),
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
        size="sm"
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
