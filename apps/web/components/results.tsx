"use client";
import Link from "next/link";
import { useState } from "react";
import type { Lang } from "@ym/core/i18n";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { WebStrings } from "@/lib/strings";

export interface ResultItem {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  eligible: true | "maybe";
  reason: string;
  officialApplyUrl: string;
  sourceUrl: string;
  lastVerifiedAt: string;
  level: "central" | "state";
  deadline: string | null;
}
export interface ResultData {
  results: ResultItem[];
  totalEligible: number;
  totalMaybe: number;
  askNext: Array<{ field: string; question: string }>;
  disclaimer: string;
}

export function SchemeCard({ r, s, lang }: { r: ResultItem; s: WebStrings; lang: Lang }) {
  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge className={r.eligible === true ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}>
          {r.eligible === true ? `✓ ${s.eligible}` : `? ${s.maybe}`}
        </Badge>
        {r.deadline && <Badge className="bg-muted">{s.deadline}: {r.deadline}</Badge>}
      </div>
      <h3 className="text-lg font-semibold leading-snug">{r.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{r.shortDescription}</p>
      <p className="mt-2 text-sm">{r.reason}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={r.officialApplyUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground">
          {s.apply} ↗
        </a>
        <Link href={`/scheme/${r.slug}?lang=${lang}`} className="inline-flex min-h-11 items-center rounded-md border border-border px-4">
          {s.viewDetails}
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {s.source}: <a className="underline" href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{new URL(r.sourceUrl).hostname}</a> · {s.verified}: {r.lastVerifiedAt}
      </p>
    </Card>
  );
}

export function Results({ data, s, lang }: { data: ResultData; s: WebStrings; lang: Lang }) {
  const [copied, setCopied] = useState(false);
  const confirmed = data.results.filter((r) => r.eligible === true);
  const shareUrl = () => {
    const ids = confirmed.map((r) => r.slug).slice(0, 20).join(",");
    return `${location.origin}/s?ids=${encodeURIComponent(ids)}&lang=${lang}`;
  };
  if (!data.results.length) return <p className="rounded-md bg-muted p-4">{s.noResults}</p>;
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">{s.results}: {data.totalEligible} ✓ · {data.totalMaybe} ?</h2>
      {data.askNext.length > 0 && (
        <p className="rounded-md bg-accent p-3 text-sm text-accent-foreground">💡 {data.askNext.slice(0, 2).map((a) => a.question).join(" · ")}</p>
      )}
      {data.results.map((r) => <SchemeCard key={r.id} r={r} s={s} lang={lang} />)}
      {confirmed.length > 0 && (
        <div className="space-y-1">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl());
                setCopied(true);
              } catch {
                prompt(s.share, shareUrl());
              }
            }}
          >
            🔗 {copied ? s.copied : s.share}
          </Button>
          <p className="text-xs text-muted-foreground">{s.shareNote}</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">{data.disclaimer}</p>
    </section>
  );
}
