import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { AppLocale } from "@/db/schema.shared";
import { useLocale } from "@/lib/use-locale";

export function SystemSettingsBar() {
  const { locale, setLocale, t } = useLocale();
  const [value, setValue] = useState<AppLocale>(locale);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(locale);
  }, [locale]);

  async function onChange(next: AppLocale) {
    setValue(next);
    setSaving(true);
    const res = await api<{ locale: AppLocale }>("/api/settings/locale", {
      method: "PATCH",
      body: JSON.stringify({ locale: next }),
    });
    setSaving(false);
    if (res.ok) {
      setLocale(res.data.locale);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="space-y-1">
        <Label htmlFor="sys-locale" className="text-xs">
          {t("common.settings")} — {t("common.language")}
        </Label>
        <select
          id="sys-locale"
          className="flex h-9 min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm"
          value={value}
          disabled={saving}
          onChange={(e) => void onChange(e.target.value as AppLocale)}
        >
          <option value="en">{t("common.english")}</option>
          <option value="tl">{t("common.tagalog")}</option>
        </select>
      </div>
      {saving ? (
        <span className="text-xs text-muted-foreground">{t("common.loading")}</span>
      ) : null}
    </div>
  );
}
