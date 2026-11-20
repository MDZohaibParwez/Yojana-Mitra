import { and, eq, sql } from "drizzle-orm";
import {
  isLang,
  type Lang,
  type ReportInput,
  type SchemeFilter,
  type SchemeRecord,
  type SchemeRepository,
  type SchemeText,
  type SearchHit,
  type UsageEvent,
} from "@ym/core";
import type { Db } from "./client.js";
import { eligibilityRules, reports, schemeEmbeddings, schemes, schemeTranslations, schemeViews, usageEvents } from "./schema.js";

/** Pluggable text embedder for semantic search (multilingual model, EMBEDDING_DIM dims). */
export interface Embedder {
  model: string;
  embed(text: string): Promise<number[]>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Postgres-backed repository. Only rows with review_status = 'approved' for BOTH
 * the scheme and its latest eligibility rule are ever returned. Translations are
 * used only when approved; otherwise core falls back to English.
 */
export class PgRepository implements SchemeRepository {
  private cache: { at: number; rows: SchemeRecord[] } | null = null;

  constructor(
    private db: Db,
    private opts: { cacheTtlMs?: number; embedder?: Embedder } = {},
  ) {}

  invalidate() {
    this.cache = null;
  }

  private async loadAll(): Promise<SchemeRecord[]> {
    const ttl = this.opts.cacheTtlMs ?? 60_000;
    if (this.cache && Date.now() - this.cache.at < ttl) return this.cache.rows;

    const rows = await this.db
      .select({ s: schemes, rule: eligibilityRules.rule })
      .from(schemes)
      .innerJoin(
        eligibilityRules,
        and(
          eq(eligibilityRules.schemeId, schemes.id),
          eq(eligibilityRules.reviewStatus, "approved"),
          // latest approved version only
          sql`${eligibilityRules.version} = (select max(r2.version) from eligibility_rules r2 where r2.scheme_id = ${schemes.id} and r2.review_status = 'approved')`,
        ),
      )
      .where(and(eq(schemes.reviewStatus, "approved"), sql`${schemes.lastVerifiedAt} is not null`));

    const translations = await this.db
      .select()
      .from(schemeTranslations)
      .where(eq(schemeTranslations.reviewStatus, "approved"));
    const byScheme = new Map<string, Array<typeof schemeTranslations.$inferSelect>>();
    for (const t of translations) {
      const list = byScheme.get(t.schemeId) ?? [];
      list.push(t);
      byScheme.set(t.schemeId, list);
    }

    const out: SchemeRecord[] = rows.map(({ s, rule }) => {
      const text: SchemeRecord["text"] = {
        en: {
          name: s.name.en ?? s.slug,
          shortDescription: s.shortDescription,
          benefits: s.benefits,
          howToApplySteps: s.howToApplySteps,
          documentsRequired: s.documentsRequired,
        },
      };
      for (const t of byScheme.get(s.id) ?? []) {
        if (!isLang(t.lang) || t.lang === "en") continue;
        const st: SchemeText = {
          name: t.name,
          shortDescription: t.shortDescription,
          benefits: t.benefits,
          howToApplySteps: t.howToApplySteps,
          documentsRequired: t.documentsRequired,
        };
        text[t.lang] = st;
      }
      return {
        id: s.id,
        slug: s.slug,
        level: s.level,
        stateCode: s.stateCode,
        ministry: s.ministry,
        category: s.category as SchemeRecord["category"],
        tags: s.tags,
        officialApplyUrl: s.officialApplyUrl,
        sourceUrl: s.sourceUrl,
        lastVerifiedAt: s.lastVerifiedAt!.toISOString().slice(0, 10),
        status: s.status,
        deadline: s.deadline,
        benefitValueInr: s.benefitValueInr,
        text,
        rule,
      };
    });
    this.cache = { at: Date.now(), rows: out };
    return out;
  }

  async listSchemes(filter: SchemeFilter = {}): Promise<SchemeRecord[]> {
    const all = await this.loadAll();
    return all.filter((s) => {
      if (!filter.includeClosed && s.status === "closed") return false;
      if (filter.level && s.level !== filter.level) return false;
      if (filter.category && s.category !== filter.category) return false;
      if (filter.state && s.level === "state" && s.stateCode !== filter.state) return false;
      return true;
    });
  }

  async getScheme(idOrSlug: string): Promise<SchemeRecord | null> {
    const all = await this.loadAll();
    return all.find((s) => s.slug === idOrSlug || (UUID.test(idOrSlug) && s.id === idOrSlug)) ?? null;
  }

  async search(query: string, opts: { lang: Lang; limit: number; state?: string }): Promise<SearchHit[]> {
    const allowed = new Set((await this.listSchemes({ state: opts.state })).map((s) => s.id));
    const q = query.trim().slice(0, 200);
    if (!q) return [];
    const scores = new Map<string, number>();

    // 1) Full-text search over base content and approved translations (prefix-matching each word).
    const words = q
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .slice(0, 8);
    if (words.length) {
      const tsq = words.map((w) => `${w.replace(/'/g, "")}:*`).join(" | ");
      const fts = await this.db.execute<{ id: string; rank: number }>(sql`
        select id, max(rank) as rank from (
          select s.id, ts_rank(ym_scheme_tsv(s.slug, s.name, s.short_description, s.benefits, s.category, s.tags), q) as rank
          from schemes s, to_tsquery('simple', ${tsq}) q
          where ym_scheme_tsv(s.slug, s.name, s.short_description, s.benefits, s.category, s.tags) @@ q
          union all
          select t.scheme_id as id, ts_rank(ym_translation_tsv(t.name, t.short_description, t.benefits), q) as rank
          from scheme_translations t, to_tsquery('simple', ${tsq}) q
          where t.review_status = 'approved' and ym_translation_tsv(t.name, t.short_description, t.benefits) @@ q
        ) x group by id order by rank desc limit 100`);
      const max = Math.max(0.0001, ...fts.map((r) => Number(r.rank)));
      for (const r of fts) scores.set(r.id, (Number(r.rank) / max) * 0.6);
    }

    // 1b) Substring fallback. Postgres' default parser splits Indic words at vowel
    //     signs, so FTS alone misses e.g. "किसान"; ILIKE over approved text catches it.
    if (words.length) {
      const patterns = words.filter((w) => w.length >= 3).map((w) => `%${w.replace(/[%_\\]/g, "")}%`);
      if (patterns.length) {
        const arr = `{${patterns.map((x) => `"${x.replace(/["\\{}]/g, "")}"`).join(",")}}`;
        const like = await this.db.execute<{ id: string; hits: number }>(sql`
          select id, count(*)::int as hits from (
            select s.id, p from schemes s, unnest(${arr}::text[]) p
            where s.name::text ilike p or s.short_description ilike p or array_to_string(s.tags, ' ') ilike p
            union
            select t.scheme_id as id, p from scheme_translations t, unnest(${arr}::text[]) p
            where t.review_status = 'approved' and (t.name ilike p or t.short_description ilike p or t.benefits ilike p)
          ) x group by id`);
        for (const r of like) {
          const add = (Number(r.hits) / patterns.length) * 0.4;
          scores.set(r.id, (scores.get(r.id) ?? 0) + add);
        }
      }
    }

    // 2) Semantic search with pgvector (cross-lingual) when an embedder is configured.
    if (this.opts.embedder) {
      try {
        const vec = await this.opts.embedder.embed(q);
        const lit = `[${vec.join(",")}]`;
        const sem = await this.db.execute<{ id: string; sim: number }>(sql`
          select scheme_id as id, max(1 - (embedding <=> ${lit}::vector)) as sim
          from scheme_embeddings group by scheme_id order by sim desc limit 50`);
        for (const r of sem) {
          const sim = Number(r.sim);
          if (sim < 0.3) continue;
          scores.set(r.id, (scores.get(r.id) ?? 0) + sim * 0.6);
        }
      } catch {
        /* semantic search is best-effort */
      }
    }

    return [...scores.entries()]
      .filter(([id]) => allowed.has(id))
      .map(([id, score]) => ({ id, score: Math.min(1, score) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit);
  }

  async createReport(input: ReportInput): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(reports)
      .values({ schemeId: input.schemeId, message: input.message, channel: input.channel })
      .returning({ id: reports.id });
    return { id: row!.id };
  }

  async recordUsage(e: UsageEvent): Promise<void> {
    await this.db.insert(usageEvents).values({
      channel: e.channel,
      tool: e.tool,
      stateCode: e.state ?? null,
      lang: e.lang ?? null,
      createdAt: e.at ?? new Date(),
    });
    const ids = [...new Set(e.schemeIds ?? [])].filter((id) => UUID.test(id)).slice(0, 20);
    if (ids.length) {
      const day = (e.at ?? new Date()).toISOString().slice(0, 10);
      await this.db
        .insert(schemeViews)
        .values(ids.map((schemeId) => ({ schemeId, day, views: 1 })))
        .onConflictDoUpdate({ target: [schemeViews.schemeId, schemeViews.day], set: { views: sql`${schemeViews.views} + 1` } });
    }
  }
}

export async function upsertEmbedding(db: Db, schemeId: string, lang: string, model: string, embedding: number[]) {
  await db
    .insert(schemeEmbeddings)
    .values({ schemeId, lang, model, embedding })
    .onConflictDoUpdate({
      target: [schemeEmbeddings.schemeId, schemeEmbeddings.lang],
      set: { embedding, model, updatedAt: new Date() },
    });
}

