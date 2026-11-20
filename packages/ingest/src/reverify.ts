import { createHash } from "node:crypto";
import { eq, ne } from "drizzle-orm";
import { schema, type Db } from "@ym/db";
import { PoliteFetcher } from "./http.js";
import { cleanText } from "./sources/html.js";

export function pageFingerprint(html: string): string {
  const text = cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      // drop volatile tokens: dates, times, visitor counters
      .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}:\d{2}(:\d{2})?\b|visitors?\s*:?\s*[\d,]+/gi, " "),
  );
  return createHash("sha256").update(text).digest("hex");
}

export type LinkResult = { ok: boolean; status: number | null; html?: string };

export async function checkLink(fetcher: PoliteFetcher, url: string, wantBody = false): Promise<LinkResult> {
  try {
    let res = await fetcher.fetch(url, wantBody ? "GET" : "HEAD");
    if (!wantBody && (res.status === 405 || res.status === 403)) res = await fetcher.fetch(url, "GET");
    return { ok: res.status < 400, status: res.status, html: wantBody && res.ok ? await res.text() : undefined };
  } catch {
    return { ok: false, status: null };
  }
}

export interface ReverifyStats {
  checked: number;
  ok: number;
  broken: number;
  changed: number;
  [k: string]: number;
}

/**
 * Monthly re-verification:
 *  - dead source / apply link  -> link_status=broken, review_status=pending (hidden until reviewed)
 *  - source page text changed  -> link_status=changed, review_status=pending
 *  - unchanged & reachable     -> link_status=ok, last_verified_at refreshed (content still matches what a human approved)
 */
export async function reverifyAll(db: Db, opts: { fetcher?: PoliteFetcher; log?: (m: string) => void; limit?: number } = {}): Promise<ReverifyStats> {
  const fetcher = opts.fetcher ?? new PoliteFetcher({ minDelayMs: 2000 });
  const log = opts.log ?? console.log;
  const rows = await db.select().from(schema.schemes).where(ne(schema.schemes.reviewStatus, "rejected")).limit(opts.limit ?? 100000);
  const stats: ReverifyStats = { checked: 0, ok: 0, broken: 0, changed: 0 };
  const [run] = await db.insert(schema.ingestRuns).values({ job: "reverify" }).returning({ id: schema.ingestRuns.id });

  for (const s of rows) {
    stats.checked++;
    const src = await checkLink(fetcher, s.sourceUrl, true);
    const apply = s.officialApplyUrl === s.sourceUrl ? src : await checkLink(fetcher, s.officialApplyUrl);
    const now = new Date();
    if (!src.ok || !apply.ok) {
      stats.broken++;
      await db
        .update(schema.schemes)
        .set({ linkStatus: "broken", reviewStatus: "pending", linkCheckedAt: now, updatedAt: now })
        .where(eq(schema.schemes.id, s.id));
      await db.insert(schema.verificationEvents).values({
        schemeId: s.id,
        kind: "link_broken",
        detail: { source: src.status, apply: apply.status },
      });
      log(`  broken ${s.slug} (source ${src.status}, apply ${apply.status})`);
      continue;
    }
    const fp = src.html ? pageFingerprint(src.html) : null;
    if (fp && s.sourcePageHash && fp !== s.sourcePageHash) {
      stats.changed++;
      await db
        .update(schema.schemes)
        .set({ linkStatus: "changed", reviewStatus: "pending", sourcePageHash: fp, linkCheckedAt: now, updatedAt: now })
        .where(eq(schema.schemes.id, s.id));
      await db.insert(schema.verificationEvents).values({ schemeId: s.id, kind: "content_changed", detail: { via: "reverify" } });
      log(`  changed ${s.slug}`);
      continue;
    }
    stats.ok++;
    await db
      .update(schema.schemes)
      .set({
        linkStatus: "ok",
        sourcePageHash: fp ?? s.sourcePageHash,
        linkCheckedAt: now,
        // Only refresh the verified date for content a human approved and that has not changed since.
        ...(s.reviewStatus === "approved" && s.sourcePageHash ? { lastVerifiedAt: now } : {}),
      })
      .where(eq(schema.schemes.id, s.id));
    await db.insert(schema.verificationEvents).values({ schemeId: s.id, kind: "link_ok", detail: null });
  }
  await db.update(schema.ingestRuns).set({ finishedAt: new Date(), stats }).where(eq(schema.ingestRuns.id, run!.id));
  return stats;
}
