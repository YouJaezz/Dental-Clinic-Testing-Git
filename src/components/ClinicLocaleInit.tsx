import { useEffect } from "react";
import type { AppLocale } from "@/db/schema.shared";
import { initLocaleFromServer } from "@/lib/use-locale";

export function ClinicLocaleInit(props: { locale: AppLocale }) {
  useEffect(() => {
    initLocaleFromServer(props.locale);
  }, [props.locale]);
  return null;
}
