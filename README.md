# Yojana Mitra

A simple way for any Indian to find out which government schemes they actually qualify for — in their own language.
Works through **Claude** (remote MCP connector), **WhatsApp** (text + voice notes) and a **mobile-first website**.

> “I’m a 42-year-old farmer from Gujarat, SC category, family income around 1.5 lakh”
> → which schemes fit and why, the documents to carry, the official apply link, and when the information was last verified.

Free service · information help only · the final decision is always with the government department · always apply on the official link.

---

## Architecture

```
                 ┌──────────── packages/core ────────────┐
 Claude ──MCP──▶ │ eligibility engine (3-valued rules)   │
 apps/mcp        │ 7 tools · ranking · i18n (9 langs)    │──▶ packages/db (Postgres + pgvector, Drizzle)
 WhatsApp ─────▶ │ conversation engine + NL parser       │        ▲
 apps/whatsapp   │ privacy guard (Aadhaar/PAN/bank/OTP)  │        │ pending → review → approved
 Website ──────▶ └───────────────────────────────────────┘   packages/ingest (myScheme + state portals,
 apps/web        apps/api: public REST + Admin API (OpenAPI)   Claude rule extraction, translation, reverify)
```

| Path | What |
|---|---|
| `packages/core` | Profile & rule schemas, deterministic `evaluate(profile, rules)`, ranking, the 7 tools, conversation engine, parser, locales, privacy guard |
| `packages/db` | Drizzle schema + migrations, Postgres repository (only approved content), review/write helpers, admin queries, session store |
| `packages/ingest` | Polite fetcher (robots.txt, rate limit), importers, normaliser, Claude rule extraction + translation, monthly re-verification, `pnpm review` CLI |
| `apps/mcp` | Remote MCP server (Streamable HTTP, stateless) for Claude |
| `apps/api` | Public REST API (same tools), `/v1/chat`, token-protected **Admin API** + OpenAPI 3.1 |
| `apps/whatsapp` | WhatsApp Cloud API webhook: buttons/lists, voice notes via STT |
| `apps/web` | Next.js website: profile form, chat, shareable results, scheme pages |
| `data/schemes` | Curated seed: 31 central + 16 state schemes (**loaded as pending — must be reviewed**) |

Key docs: [DECISIONS.md](DECISIONS.md) · [DATA_SOURCES.md](DATA_SOURCES.md) · [ADMIN_API.md](ADMIN_API.md) · [SECURITY.md](SECURITY.md) · [docs/openapi.json](docs/openapi.json) · [docs/CONNECTOR_SUBMISSION.md](docs/CONNECTOR_SUBMISSION.md)

## The 7 tools (identical on MCP, REST, WhatsApp and web)

| Tool | Purpose |
|---|---|
| `find_schemes(profile, query?, lang?)` | Ranked matches with a one-line reason each + the next questions to ask |
| `get_scheme(id_or_slug, lang?)` | Full detail, official link, source link, last verified date |
| `check_eligibility(scheme_id, profile)` | yes / no / maybe, with passed, failed and missing conditions |
| `compare_schemes(ids[], lang?)` | Side-by-side comparison |
| `document_checklist(profile or scheme_ids[])` | Combined, de-duplicated document list |
| `upcoming_deadlines(state?, days?)` | Schemes closing soon |
| `report_issue(scheme_id, message)` | Report wrong information |

## Local setup

Requirements: Node 20+, pnpm 10, Postgres 16 with the `pgvector` extension.

```bash
pnpm install
cp .env.example .env            # fill in what you need; see table below
createdb yojana_mitra           # or use a Neon / Supabase database
export DATABASE_URL=postgres://...

pnpm db:migrate                 # apply migrations
pnpm db:seed                    # load curated schemes as PENDING (safe for production)
pnpm review                     # interactively approve / reject each scheme (stamps last_verified_at)
# local dev shortcut ONLY: pnpm db:seed --dev-approve   (refused when NODE_ENV=production)

pnpm --filter @ym/api dev       # http://localhost:4000   (/v1/meta, /admin/v1/openapi.json)
pnpm --filter @ym/mcp dev       # http://localhost:3333/mcp
pnpm --filter @ym/web dev       # http://localhost:3000
pnpm --filter @ym/whatsapp dev  # http://localhost:4100/webhook  (expose with a tunnel for Meta)
```

No database? `YM_DEV_SEED=1 pnpm --filter @ym/mcp dev` serves the curated seed from memory (dev only, marked unverified).

### Tests

```bash
pnpm typecheck
pnpm test                                     # unit + integration (DB tests skip without TEST_DATABASE_URL)
TEST_DATABASE_URL=postgres://.../yojana_mitra_test pnpm test   # DB name must contain "test" (it is wiped)
BASE_URL=http://localhost:3000 pnpm --filter @ym/web e2e        # Playwright smoke test of the website
```

Coverage of the quality bar: 60 realistic profiles × curated schemes for the engine (`packages/core/test/profiles.test.ts`),
integration tests for all 7 tools in core, through REST, and through a real MCP client, WhatsApp webhook tests, Admin API tests
against Postgres. Local Lighthouse (mobile): Performance 95–98, Accessibility 98–100, Best practices 96, SEO 100.

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | all | Use the **pooled** URL on Vercel (Neon `-pooler`, Supabase :6543) |
| `SESSION_HMAC_KEY` | whatsapp, api | ≥ 32 random chars; derives anonymous session keys / rate-limit keys |
| `SESSION_TTL_MINUTES` | whatsapp | Default 60 |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | whatsapp | From Meta for Developers → WhatsApp → API setup |
| `STT_PROVIDER`, `STT_API_KEY`, `STT_URL`, `STT_MODEL` | whatsapp | `sarvam` (default when key set) or `openai-compatible` |
| `ADMIN_API_KEY_HASHES` | api | Comma-separated sha256 of admin keys (`pnpm --filter @ym/api admin:key`) |
| `ADMIN_JWT_SECRET` | api | ≥ 32 chars, enables `/admin/v1/auth/token` |
| `CRON_SECRET` | api | Protects the daily session-cleanup cron |
| `CORS_ORIGINS`, `RATE_LIMIT_PER_MINUTE` | api | Public API CORS / limit |
| `ANTHROPIC_API_KEY`, `INGEST_MODEL` | ingest | Rule extraction & translation (default `claude-opus-5-5`) |
| `EMBEDDINGS_URL`, `EMBEDDINGS_API_KEY`, `EMBEDDINGS_MODEL` | api, mcp, web | Optional semantic search (1024-dim multilingual model) |
| `PRIVACY_POLICY_URL` | mcp | Shown on the MCP landing JSON |

## Deploying to Vercel

Create **four Vercel projects from this one repo** (Root Directory per app, “Include files outside the root directory” enabled):

| Project | Root directory | Notes |
|---|---|---|
| yojana-mitra-web | `apps/web` | Framework: Next.js. Env: `DATABASE_URL` |
| yojana-mitra-mcp | `apps/mcp` | `vercel.json` runs `build:vercel`, which emits a single bundled function via the Build Output API (`.vercel/output`). Env: `DATABASE_URL`, `PRIVACY_POLICY_URL` |
| yojana-mitra-api | `apps/api` | Same pattern; includes the daily cron. Env: DB, admin, CORS, `CRON_SECRET` |
| yojana-mitra-whatsapp | `apps/whatsapp` | Same pattern. Env: DB, WhatsApp, STT, `SESSION_HMAC_KEY` |

Then:
1. Create the database (Neon or Supabase), enable `vector`, run `pnpm db:migrate` and `pnpm db:seed` from your machine against it, and review with `pnpm review`.
2. In Meta for Developers set the webhook URL to `https://<whatsapp-project>/webhook`, the verify token to `WHATSAPP_VERIFY_TOKEN`, and subscribe to `messages`.
3. Add a GitHub Actions secret `DATABASE_URL` so `.github/workflows/reverify.yml` runs the monthly link/content check.
4. Optional: add a Vercel Firewall rate-limit rule on `/mcp`, `/v1/*` and `/webhook`.

## Submitting the Claude connector

1. Deploy `apps/mcp` on a stable HTTPS domain and the website (for `/privacy` and `/terms`).
2. In Claude: **Settings → Connectors → Add custom connector**, URL `https://<mcp-domain>/mcp`. Run the test prompts in [docs/CONNECTOR_SUBMISSION.md](docs/CONNECTOR_SUBMISSION.md).
3. Also check with MCP Inspector (`npx @modelcontextprotocol/inspector`).
4. Submit through Anthropic's connector-directory submission form (see the current remote MCP server guidelines in the Claude Help Center) with the listing details from the checklist.

## Data: how a scheme reaches users

`import (myScheme / state portal, robots.txt + ToS respected) → normalise → Claude converts eligibility text to a rule tree → translate → stored as PENDING → human review (pnpm review / Admin API) → approved & last_verified_at stamped → served`. Monthly re-verification hides schemes whose links break or whose pages change until re-reviewed. Importers ship **disabled** until someone records the portal's terms in [DATA_SOURCES.md](DATA_SOURCES.md).

## Languages

Hindi, English and Hinglish first; Gujarati, Marathi, Tamil, Telugu, Bengali and Kannada for all bot and website text. The user's language is detected automatically (script + marker words) and can be switched any time (“English”, “हिंदी”, the website language menu). Scheme names stay in their official form.

## Who this is for

Mainly for people who help others apply for schemes every day — CSC operators, form agents, panchayat staff, NGO workers — and for anyone figuring out benefits for themselves or their family. Beneficiaries (farmers, workers, women, students, senior citizens, people with disabilities) will mostly use it through WhatsApp.

## Contributing

Help with data verification, language review, testing, or connecting us with CSC groups / NGOs is welcome — open an issue.

## License

Not decided yet (probably MIT).
