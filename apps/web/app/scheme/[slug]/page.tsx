import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScheme, isLang, ToolError } from "@ym/core";
import { getRepository } from "@ym/db";
import { ReportForm } from "@/components/report-form";
import { currentLang } from "@/lib/lang";
import { t } from "@/lib/strings";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function load(slug: string, lang: Parameters<typeof t>[0]) {
  try {
    return await getScheme({ repo: getRepository(), channel: "web" }, { idOrSlug: slug, lang });
  } catch (e) {
    if (e instanceof ToolError) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug, "en");
  return d ? { title: d.name, description: d.shortDescription } : { title: "Not found" };
}

export default async function SchemePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const lang = isLang(sp.lang) ? sp.lang : await currentLang();
  const s = t(lang);
  const d = await load(slug, lang);
  if (!d) notFound();
  return (
    <article className="space-y-5 pt-2">
      <header>
        <p className="text-sm text-muted-foreground">{d.ministry}</p>
        <h1 className="text-2xl font-bold leading-tight">{d.name}</h1>
        <p className="mt-2">{d.shortDescription}</p>
      </header>
      <a href={d.officialApplyUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground">
        {s.apply} ↗
      </a>
      <section>
        <h2 className="text-lg font-semibold">{s.benefits}</h2>
        <p>{d.benefits}</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{s.howToApply}</h2>
        <ol className="list-decimal space-y-1 pl-5">{d.howToApplySteps.map((x, i) => <li key={i}>{x}</li>)}</ol>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{s.documents}</h2>
        <ul className="list-disc space-y-1 pl-5">{d.documentsRequired.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </section>
      {d.deadline && <p><strong>{s.deadline}:</strong> {d.deadline}</p>}
      <p className="text-sm text-muted-foreground">
        {s.source}: <a className="underline" href={d.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{d.sourceUrl}</a> · {s.verified}: {d.lastVerifiedAt}
      </p>
      <p className="text-sm text-muted-foreground">{d.disclaimer}</p>
      <ReportForm schemeId={d.id} s={s} />
    </article>
  );
}
