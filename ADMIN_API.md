# Admin API

Token-protected API for the **separate admin panel** (not part of this repo). The full machine-readable
spec is OpenAPI 3.1: [`docs/openapi.json`](docs/openapi.json), also served live at `GET /admin/v1/openapi.json`.
Regenerate the file with `pnpm --filter @ym/api openapi`.

Base URL: the API deployment (`apps/api`), e.g. `https://api.yojanamitra.example`. All admin routes are under `/admin/v1`.

## Authentication

| Method | How |
|---|---|
| API key | `Authorization: Bearer ym_…`. Create with `pnpm --filter @ym/api admin:key <name> [--scopes read,write,review] [--store]`. The raw key is printed once; only its sha256 is kept — either in the `ADMIN_API_KEY_HASHES` env var (comma-separated) or in the `admin_api_keys` table (`--store`, revocable via `revoked_at`). |
| JWT | `POST /admin/v1/auth/token {"apiKey": "ym_…"}` → `{ token, expiresAt }` (HS256, 15 min, needs `ADMIN_JWT_SECRET` ≥ 32 chars). Use it as `Authorization: Bearer <jwt>` so the browser never holds the long-lived key — ideally the panel's backend does the exchange. |

Scopes: `read` (lists, details, stats), `write` (edit schemes, add rule versions, translations), `review` (approve / reject, update reports). Keys from the env var have all scopes. Admin requests are rate-limited (`ADMIN_RATE_LIMIT_PER_MINUTE`, default 300).

Errors are always `{"error": {"code": "...", "message": "..."}}` with status 400 / 401 / 403 / 404 / 409 / 429.

## Review model (important for the panel UI)

- Anything created by ingestion, the seed, or an edit through this API is **pending** and invisible to users.
- A scheme is shown to users only when the scheme is `approved`, has `last_verified_at`, and its **latest approved** rule version exists.
- `POST /schemes/{id}/approve` approves the latest pending rule + scheme content + pending translations and stamps `last_verified_at` (= human verification date shown to users).
- `PATCH /schemes/{id}` puts the scheme back to `pending` unless `"approve": true` is sent by a principal with `review`.
- New rule versions (`POST /schemes/{id}/rules`) are always pending; the previous approved version keeps serving until the new one is approved. Use `POST /schemes/{id}/rules/preview` to test a rule against a profile first.
- The monthly re-verification job marks dead / changed source pages `link_status = broken|changed` and sets the scheme to pending; they appear in `GET /review/links`.

## Endpoints

| Method & path | Scope | Purpose |
|---|---|---|
| `GET /openapi.json` | – | This spec |
| `POST /auth/token` | – | API key → 15-min JWT |
| `GET /me` | any | Current principal |
| `GET /schemes?q&level&state&reviewStatus&linkStatus&category&limit&offset` | read | List / search all schemes |
| `GET /schemes/{id}` | read | Scheme + all rule versions (with official source text) + translations + verification events |
| `PATCH /schemes/{id}` | write (+review to approve) | Edit fields |
| `PUT /schemes/{id}/translations/{lang}` | write | Create / replace a translation |
| `POST /schemes/{id}/rules` | write | Add a pending rule version |
| `POST /schemes/{id}/rules/preview` | read | Evaluate a candidate rule against a profile |
| `POST /schemes/{id}/approve` · `/reject` | review | Review decision |
| `GET /review/summary` | read | Counts: pending rules / schemes, open reports, link issues |
| `GET /review/rules` | read | Pending rule queue |
| `POST /rules/{ruleId}/approve` · `/reject` | review | Decide a single rule version |
| `GET /review/reports?status` · `PATCH /reports/{id}` | read · review | User reports of wrong info |
| `GET /review/links` | read | Broken / changed links |
| `GET /stats?days=28` | read | Weekly events per channel, eligibility checks, top states, languages, top schemes |
| `GET /cron/cleanup` | `CRON_SECRET` | Daily purge of expired chat sessions (Vercel Cron) |

## Example

```bash
KEY=ym_xxx
curl -s -H "Authorization: Bearer $KEY" "$API/admin/v1/review/summary"
curl -s -H "Authorization: Bearer $KEY" "$API/admin/v1/review/rules?limit=10"
curl -s -X POST -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"notes":"Checked against pmkisan.gov.in on 2026-11-20"}' "$API/admin/v1/schemes/pm-kisan/approve"
curl -s -H "Authorization: Bearer $KEY" "$API/admin/v1/stats?days=7"
```

## Analytics

`usage_events` stores only `channel, tool, state_code, lang, created_at`; `scheme_views` stores per-scheme daily counts.
Neither table can hold names, phone numbers, IPs or ID numbers.
