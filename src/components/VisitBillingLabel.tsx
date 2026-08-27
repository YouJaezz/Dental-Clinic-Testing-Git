import { useEffect } from "react";
import { useLocale } from "@/lib/use-locale";

/** Updates sidebar tagline when locale changes. */
export function VisitBillingLabel() {
  const { t } = useLocale();

  useEffect(() => {
    const el = document.getElementById("nav-visit-billing-label");
    if (el) el.textContent = t("nav.visitBilling");
  }, [t]);

  return null;
}
