import { useEffect, useState } from "react";
import type { AppLocale } from "@/db/schema.shared";
import { getLocale, setLocale, subscribeLocale, t, type TranslationKey } from "@/lib/i18n";

export function useLocale() {
  const [, tick] = useState(0);
  useEffect(() => subscribeLocale(() => tick((n) => n + 1)), []);
  return {
    locale: getLocale(),
    setLocale,
    t: (key: TranslationKey, params?: Record<string, string | number>) =>
      t(key, params),
  };
}

export function initLocaleFromServer(locale: AppLocale): void {
  setLocale(locale);
}
