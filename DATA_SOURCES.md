# Data sources

Yojana Mitra only answers from its own reviewed database. This file records, per source, what its
terms of use and robots.txt allow, and how we import from it. **Every importer is disabled
(`termsReviewed: false` in `packages/ingest/src/sources/registry.ts`) until a maintainer fills in
the table below for that source.**

## Status as of this build

The build sandbox could **not** reach any `*.gov.in` host (blocked by the sandbox network policy), so
robots.txt and Terms of Use were **not** checked from here. Nothing has been scraped. Run
`pnpm --filter @ym/ingest check-sources` from a normal network to print each source's robots.txt verdict.

| Source | Base URL | robots.txt (date checked) | Terms of Use / copyright reviewed | Import method | Rate limit | Enabled |
|---|---|---|---|---|---|---|
| myScheme (NeGD, MeitY) | https://www.myscheme.gov.in | _not yet checked_ | _not yet reviewed_ | Public sitemap + public scheme pages (`__NEXT_DATA__` JSON or headings). **Does not** use the internal search API or its embedded API key. | 1 request / 3 s | no |
| NSAP | https://nsap.nic.in | _not yet checked_ | _not yet reviewed_ | HTML pages | 1 / 3 s | no |
| National Scholarship Portal | https://scholarships.gov.in | _not yet checked_ | _not yet reviewed_ | HTML pages | 1 / 3 s | no |
| 36 State / UT portals | see `registry.ts` | _not yet checked_ | _not yet reviewed_ | Config-driven HTML importer (`listUrls` + `linkPattern` must be set per portal) | 1 / 3 s | no |

## Checklist to enable a source

1. Read the portal's *Terms of Use*, *Copyright Policy* and *Hyperlinking Policy* (most GoI portals follow the
   GIGW guidelines; many allow reproduction of material "free of charge … accurately and not in a derogatory
   manner, with source acknowledged" — confirm the exact wording for that portal).
2. Run `pnpm --filter @ym/ingest check-sources`; note the robots.txt verdict and any `Crawl-delay`.
3. Record date, findings and a link to the policy page in the table above.
4. For state portals, set `listUrls` and `linkPattern` for the scheme directory.
5. Set `termsReviewed: true`, then `pnpm ingest <sourceId> --limit 5 --dry-run` before a full run.

## How the crawler behaves

- HTTPS only; identifies itself as `YojanaMitraBot/0.1 (+repo URL)` — no personal contact data.
- Obeys robots.txt (longest-match Allow/Disallow, `Crawl-delay`); if robots.txt returns 5xx or cannot be
  fetched, the whole host is treated as disallowed.
- At most one request per host every `rateLimitMs` (default 3 s); exponential backoff on 429/5xx; 2 retries.
- Stores only scheme information (public), never any personal data.

## Pipeline

`fetch → parse → normalize → LLM rule extraction (Claude, structured output, validated by zod) → translate →
upsert as pending`. Every LLM-generated rule and translation is stored with `review_status = 'pending'` and
the official eligibility text it came from (`eligibility_rules.source_text`), plus criteria the model could
not map. Nothing is shown to users until approved with `pnpm review` (later: the admin panel via the Admin API).

## Curated seed (`data/schemes/*.json`)

The 31 central schemes and the state schemes in `data/schemes/states/` were written by the coding agent from
its knowledge of official scheme guidelines, citing the official portal as `sourceUrl`. They are loaded as
**pending** and must be checked against the official source by a human before approval. Amounts and
thresholds change often (e.g. PMMVY 2.0 criteria, PM-JAY 70+ expansion, MUDRA Tarun Plus) — verify each one.

## Re-verification

`pnpm reverify` (scheduled monthly by `.github/workflows/reverify.yml`) checks every scheme's source and
apply links and fingerprints the source page text. Dead links or changed pages set the scheme back to
`pending` (hidden) and appear in the Admin API review queue (`/admin/v1/review/links`). Unchanged pages of
approved schemes get `last_verified_at` refreshed.
