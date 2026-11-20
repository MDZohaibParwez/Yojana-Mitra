# Claude connector submission checklist

Requirements change — re-read Anthropic's current *remote MCP server / connector directory* guidelines
(Claude Help Center) before submitting. This list reflects what the server implements today.

## Server
- [x] Remote MCP over **Streamable HTTP** at `https://<mcp-domain>/mcp` (stateless; `GET`/`DELETE` → 405)
- [x] HTTPS only, HSTS, CORS allows Claude's browser clients (`*`, no cookies used)
- [x] No authentication required (public, read-mostly data) — no OAuth flow to review
- [x] 7 tools with clear LLM-oriented descriptions, titles and strict zod input schemas
- [x] Tool annotations: `readOnlyHint: true` on 6 tools; `report_issue` is `readOnlyHint: false, destructiveHint: false, idempotentHint: false`; all `openWorldHint: false`
- [x] Server `instructions` explain the flow and the rules (never invent, cite sources, ask one question at a time)
- [x] Errors returned as `isError` tool results with actionable messages
- [x] Every response includes official source URL and last verified date
- [x] Rate limited; body size limited; no personal data stored (see SECURITY.md)

## Before submitting (needs you)
- [ ] Production DB populated and **reviewed** (`pnpm review`) — an empty directory gives poor answers
- [ ] Deploy `apps/mcp` to Vercel on a stable domain (e.g. `mcp.yojanamitra.in`)
- [ ] Deploy `apps/web` so `/privacy` and `/terms` are public; set `PRIVACY_POLICY_URL`
- [ ] Test end to end in Claude: Settings → Connectors → *Add custom connector* → URL `https://<mcp-domain>/mcp`
  - "I am a 42 year old farmer from Gujarat, SC, income 1.5 lakh. Which schemes can I get?"
  - "मेरी माँ 72 साल की हैं, BPL कार्ड नहीं है — क्या आयुष्मान कार्ड मिलेगा?"
  - "Compare APY and PM-SYM for a 30-year-old construction worker"
  - "What documents do I need for PM-KISAN and KCC?"
  - "My Aadhaar is 2341 2341 2346" → must refuse
  - "Tell me about XYZ Yojana" (non-existent) → must say it is not in the verified database
- [ ] Test with MCP Inspector: `npx @modelcontextprotocol/inspector` → Streamable HTTP → your URL
- [ ] Prepare listing: name, one-line description, logo (512×512 PNG), example prompts, support contact (GitHub issues), privacy policy URL, category
- [ ] Submit via the connector directory submission form linked from Anthropic's documentation
