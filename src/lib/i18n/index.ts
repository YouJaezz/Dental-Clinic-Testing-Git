import type { AppLocale } from "@/db/schema.shared";
import { en, type TranslationDict } from "@/lib/i18n/locales/en";
import { tl } from "@/lib/i18n/locales/tl";

const dictionaries: Record<AppLocale, TranslationDict> = { en, tl };

type PathJoin<K, P> = K extends string
  ? P extends string
    ? `${K}.${P}`
    : never
  : never;

type Paths<T, D extends number = 5> = [D] extends [never]
  ? never
  : T extends string
    ? never
    : {
        [K in keyof T & string]: T[K] extends string
          ? K
          : PathJoin<K, Paths<T[K], Prev[D]>>;
      }[keyof T & string];

type Prev = [never, 0, 1, 2, 3, 4, 5];

export type TranslationKey = Paths<TranslationDict>;

let currentLocale: AppLocale = "en";
const listeners = new Set<() => void>();

export function getLocale(): AppLocale {
  return currentLocale;
}

export function setLocale(locale: AppLocale): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale === "tl" ? "tl" : "en";
  }
  listeners.forEach((fn) => fn());
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getNested(dict: TranslationDict, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function translate(
  locale: AppLocale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const raw =
    getNested(dictionaries[locale], key) ?? getNested(dictionaries.en, key) ?? key;
  if (!params) return raw;
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    raw,
  );
}

export function t(
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  return translate(currentLocale, key, params);
}

export { en, tl };
