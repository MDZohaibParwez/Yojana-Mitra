-- Multilingual full-text search. 'simple' config: no stemming, works for all Indic scripts.
-- Wrapped in IMMUTABLE functions so they can be used in expression indexes.
CREATE OR REPLACE FUNCTION ym_scheme_tsv(slug text, name jsonb, descr text, benefits text, category text, tags text[])
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_tsvector('simple'::regconfig,
    replace(coalesce(slug, ''), '-', ' ') || ' ' || coalesce(name::text, '') || ' ' || coalesce(descr, '') || ' ' ||
    coalesce(benefits, '') || ' ' || coalesce(category, '') || ' ' || coalesce(array_to_string(tags, ' '), ''))
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION ym_translation_tsv(name text, descr text, benefits text)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(descr, '') || ' ' || coalesce(benefits, ''))
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schemes_fts_idx" ON "schemes" USING gin (
  ym_scheme_tsv("slug", "name", "short_description", "benefits", "category", "tags")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheme_translations_fts_idx" ON "scheme_translations" USING gin (
  ym_translation_tsv("name", "short_description", "benefits")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheme_embeddings_hnsw_idx" ON "scheme_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
-- Hard guarantee: an approved rule must have a reviewer.
ALTER TABLE "eligibility_rules" ADD CONSTRAINT "approved_rules_have_reviewer"
  CHECK ("review_status" <> 'approved' OR ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL));
