import type { Metadata } from "next";
import Link from "next/link";
import { getScheme, isLang, ToolError } from "@ym/core";
import { getRepository } from "@ym/db";
import { SchemeCard } from "@/components/results";
import { currentLang } from "@/lib/lang";
import { t } from "@/lib/strings";

export const metadata: Metadata = { title: "Shared schemes", robots: { index: false } };

/** Shareable result page: the URL holds only scheme slugs, never personal data. */
export default async function Shared({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lang = isLang(sp.lang) ? sp.lang : await currentLang();
  const s = t(lang);
  const slugs = (sp.ids ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9-]{2,120}$/.test(x)).slice(0, 20);
  const schemes = (
    await Promise.all(
      slugs.map((slug) =>
        getScheme({ repo: getRepository(), channel: "web" }, { idOrSlug: slug, lang }).catch((e) => (e instanceof ToolError ? null : Promise.reject(e))),
      ),
    )
  ).filter((x) => x !== null);
  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-bold">{s.sharedTitle}</h1>
      {schemes.length === 0 && <p>{s.noResults}</p>}
      {schemes.map((r) => (
        <SchemeCard key={r.id} lang={lang} s={s} r={{ ...r, eligible: true, reason: r.shortDescription, deadline: r.deadline }} />
      ))}
      <Link href="/" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground">{s.backHome}</Link>
    </div>
  );
}
