"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LANG_NAMES, type Lang } from "@ym/core/i18n";
import { setLangAction } from "@/lib/actions";

export function LangSwitcher({ lang, label }: { lang: Lang; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="min-h-10 rounded-md border border-border bg-background px-2"
        defaultValue={lang}
        disabled={pending}
        onChange={(e) => start(async () => { await setLangAction(e.target.value); router.refresh(); })}
      >
        {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
          <option key={l} value={l}>{LANG_NAMES[l]}</option>
        ))}
      </select>
    </label>
  );
}
