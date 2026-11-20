import { getLocale, type Lang } from "@ym/core/i18n";

/** Shown on every page: free service, never pay, apply only on official links. */
export function SafetyNotice({ lang }: { lang: Lang }) {
  const L = getLocale(lang);
  return (
    <div role="note" className="border-b border-border bg-accent px-4 py-2 text-center text-sm text-accent-foreground">
      <strong>⚠️ {L.freeServiceNote}</strong> {L.disclaimer}
    </div>
  );
}
