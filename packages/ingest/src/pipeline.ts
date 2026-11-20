import { eq } from "drizzle-orm";
import { LANGS, type Lang, type RuleNode, type SchemeText, type SeedScheme, SeedSchemeSchema } from "@ym/core";
import { schema, upsertScheme, type Db } from "@ym/db";
import { PoliteFetcher } from "./http.js";
import { normalize } from "./normalize.js";
import { myschemeImporter } from "./sources/myscheme.js";
import { htmlImporter } from "./sources/generic.js";
import { getSource } from "./sources/registry.js";
import type { Importer, RawScheme, SourceConfig } from "./sources/types.js";
import { extractRule, type ExtractedRule } from "./llm/rules.js";
import { translateScheme } from "./llm/translate.js";

export interface PipelineDeps {
  fetcher?: PoliteFetcher;
  importer?: Importer;
  extract?: (input: { name: string; stateCode: string | null; eligibility: string; exclusions?: string }) => Promise<ExtractedRule>;
  translate?: (text: SchemeText, lang: Lang) => Promise<SchemeText>;
  log?: (msg: string) => void;
  /** override the registry entry (tests) */
  source?: SourceConfig;
}

export interface IngestOptions {
  limit?: number;
  langs?: Lang[];
  dryRun?: boolean;
}

export interface IngestStats {
  listed: number;
  fetched: number;
  skipped: number;
  upserted: number;
  changed: number;
  failed: number;
  [k: string]: number;
}

export function importerFor(cfg: SourceConfig): Importer {
  return cfg.kind === "myscheme" ? myschemeImporter : htmlImporter(cfg);
}

/** raw -> normalised -> LLM rule (pending) -> translations (pending) -> validated SeedScheme */
export async function buildSeed(raw: RawScheme, deps: Required<Pick<PipelineDeps, "extract">> & PipelineDeps, langs: Lang[]) {
  const base = normalize(raw);
  const extracted = await deps.extract({
    name: raw.name,
    stateCode: raw.stateCode,
    eligibility: raw.sections.eligibility!,
    exclusions: raw.sections.exclusions,
  });
  const text: Record<string, SchemeText> = { en: base.text.en! };
  for (const l of langs) {
    if (l === "en" || !deps.translate) continue;
    try {
      text[l] = await deps.translate(base.text.en!, l);
    } catch (e) {
      deps.log?.(`translate ${base.slug} -> ${l} failed: ${(e as Error).message}`);
    }
  }
  const seed: SeedScheme = SeedSchemeSchema.parse({ ...base, text, rule: extracted.rule as RuleNode });
  const sourceText = [raw.sections.eligibility, raw.sections.exclusions ? `EXCLUSIONS:\n${raw.sections.exclusions}` : ""]
    .filter(Boolean)
    .join("\n\n");
  return { seed, extracted, sourceText };
}

export async function ingestSource(db: Db | null, sourceId: string, opts: IngestOptions = {}, deps: PipelineDeps = {}): Promise<IngestStats> {
  const cfg = deps.source ?? getSource(sourceId);
  if (!cfg) throw new Error(`unknown source ${sourceId}`);
  if (!cfg.termsReviewed) {
    throw new Error(`source "${sourceId}" is disabled: review its Terms of Use and robots.txt, record it in DATA_SOURCES.md, then set termsReviewed: true in sources/registry.ts`);
  }
  const log = deps.log ?? console.log;
  const fetcher = deps.fetcher ?? new PoliteFetcher({ minDelayMs: cfg.rateLimitMs });
  const importer = deps.importer ?? importerFor(cfg);
  const extract = deps.extract ?? extractRule;
  const translate = deps.translate ?? ((t: SchemeText, l: Lang) => translateScheme(t, l));
  const langs = opts.langs ?? (["hi"] as Lang[]);
  const stats: IngestStats = { listed: 0, fetched: 0, skipped: 0, upserted: 0, changed: 0, failed: 0 };

  let runId: string | null = null;
  if (db && !opts.dryRun) {
    await db
      .insert(schema.sources)
      .values({ id: cfg.id, name: cfg.name, baseUrl: cfg.baseUrl, kind: cfg.kind, stateCode: cfg.stateCode, enabled: true, rateLimitMs: cfg.rateLimitMs })
      .onConflictDoNothing();
    const [run] = await db.insert(schema.ingestRuns).values({ sourceId: cfg.id, job: "ingest" }).returning({ id: schema.ingestRuns.id });
    runId = run!.id;
  }

  try {
    const urls = await importer.list(fetcher, opts.limit);
    stats.listed = urls.length;
    for (const url of urls) {
      try {
        const raw = await importer.fetchScheme(fetcher, url);
        if (!raw) {
          stats.skipped++;
          continue;
        }
        stats.fetched++;
        const { seed, extracted, sourceText } = await buildSeed(raw, { ...deps, extract, translate, log }, langs);
        if (extracted.unmapped.length) log(`  ${seed.slug}: unmapped criteria -> ${extracted.unmapped.join(" | ")}`);
        if (db && !opts.dryRun) {
          const r = await upsertScheme(db, seed, {
            generatedBy: "llm",
            sourceId: cfg.id,
            sourceText: `${sourceText}\n\n[confidence: ${extracted.confidence}; unmapped: ${extracted.unmapped.join("; ") || "none"}]`,
            model: extracted.model,
          });
          stats.upserted++;
          if (r.changed) stats.changed++;
        }
        log(`  ok ${seed.slug} (pending review)`);
      } catch (e) {
        stats.failed++;
        log(`  fail ${url}: ${(e as Error).message}`);
      }
    }
  } finally {
    if (db && runId) {
      await db.update(schema.ingestRuns).set({ finishedAt: new Date(), stats }).where(eq(schema.ingestRuns.id, runId));
    }
  }
  return stats;
}

export const ALL_LANGS = LANGS;
