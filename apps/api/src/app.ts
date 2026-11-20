import { createHash } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import {
  LANG_NAMES,
  OCCUPATIONS,
  PROFILE_FIELDS,
  RateLimiter,
  SOCIAL_CATEGORIES,
  STATES,
  TOOLS,
  ToolError,
  type SchemeRepository,
  type ToolName,
} from "@ym/core";

export interface AppDeps {
  repo: () => SchemeRepository;
  /** Mounted under /admin/v1 when provided. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin?: Hono<any>;
  /** Mounted under /v1/chat when provided. */
  chat?: Hono;
  rateLimitPerMinute?: number;
  corsOrigins?: string[];
}

/** Anonymous client key: sha256(ip + daily salt). The raw IP is never stored or logged. */
export function clientKey(c: Context): string {
  const ip =
    c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${day}|${process.env.SESSION_HMAC_KEY ?? "ym"}`).digest("hex").slice(0, 32);
}

export function toolErrorStatus(e: ToolError): 400 | 404 | 422 | 500 {
  return e.code === "not_found" ? 404 : e.code === "invalid_input" ? 400 : e.code === "sensitive_data" ? 422 : 500;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const limiter = new RateLimiter(deps.rateLimitPerMinute ?? Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60));
  const origins = deps.corsOrigins ?? (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim());

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
      referrerPolicy: "no-referrer",
      crossOriginResourcePolicy: "cross-origin",
    }),
  );
  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", c.res.headers.get("Cache-Control") ?? "no-store");
  });
  app.use("*", bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: { code: "payload_too_large", message: "Request body too large" } }, 413) }));
  app.use("/v1/*", cors({ origin: origins.includes("*") ? "*" : origins, allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["content-type"], maxAge: 86400 }));
  app.use("/v1/*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    const r = limiter.check(clientKey(c));
    c.header("RateLimit-Remaining", String(r.remaining));
    if (!r.allowed) {
      c.header("Retry-After", String(Math.ceil((r.resetAt - Date.now()) / 1000)));
      return c.json({ error: { code: "rate_limited", message: "Too many requests. Please wait a minute." } }, 429);
    }
    return next();
  });

  app.onError((err, c) => {
    if (err instanceof ToolError) return c.json({ error: { code: err.code, message: err.message } }, toolErrorStatus(err));
    if (err instanceof SyntaxError) return c.json({ error: { code: "invalid_json", message: "Body must be valid JSON" } }, 400);
    console.error("[api] unhandled error:", err.name); // never log request bodies
    return c.json({ error: { code: "internal", message: "Internal error" } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "not_found", message: "Route not found" } }, 404));

  const run = (name: ToolName, input: unknown) => TOOLS[name]({ repo: deps.repo(), channel: "api" }, input);
  const body = async (c: Context) => {
    const text = await c.req.text();
    return text ? JSON.parse(text) : {};
  };

  app.get("/v1/health", (c) => c.json({ ok: true }));
  app.get("/v1/meta", (c) => {
    c.header("Cache-Control", "public, max-age=3600");
    return c.json({
      languages: LANG_NAMES,
      states: STATES.map((s) => ({ code: s.code, en: s.en, hi: s.hi, type: s.type })),
      profileFields: PROFILE_FIELDS,
      occupations: OCCUPATIONS,
      socialCategories: SOCIAL_CATEGORIES,
      tools: Object.keys(TOOLS),
    });
  });

  // Generic tool endpoint (same inputs as the MCP tools).
  app.post("/v1/tools/:name", async (c) => {
    const name = c.req.param("name") as ToolName;
    if (!(name in TOOLS)) return c.json({ error: { code: "not_found", message: `Unknown tool. Available: ${Object.keys(TOOLS).join(", ")}` } }, 404);
    return c.json(await run(name, await body(c)));
  });

  // REST-style aliases.
  app.post("/v1/schemes/search", async (c) => c.json(await run("find_schemes", await body(c))));
  app.post("/v1/schemes/compare", async (c) => c.json(await run("compare_schemes", await body(c))));
  app.get("/v1/schemes/:id", async (c) => {
    const res = await run("get_scheme", { idOrSlug: c.req.param("id"), ...(c.req.query("lang") ? { lang: c.req.query("lang") } : {}) });
    c.header("Cache-Control", "public, max-age=300, s-maxage=600");
    return c.json(res);
  });
  app.post("/v1/schemes/:id/eligibility", async (c) => c.json(await run("check_eligibility", { ...(await body(c)), schemeId: c.req.param("id") })));
  app.post("/v1/schemes/:id/reports", async (c) => c.json(await run("report_issue", { ...(await body(c)), schemeId: c.req.param("id") }), 201));
  app.post("/v1/documents/checklist", async (c) => c.json(await run("document_checklist", await body(c))));
  app.get("/v1/deadlines", async (c) => {
    const q = c.req.query();
    return c.json(
      await run("upcoming_deadlines", {
        ...(q.state ? { state: q.state } : {}),
        ...(q.days ? { days: Number(q.days) } : {}),
        ...(q.lang ? { lang: q.lang } : {}),
      }),
    );
  });

  if (deps.chat) app.route("/v1/chat", deps.chat);
  if (deps.admin) app.route("/admin/v1", deps.admin);
  return app;
}
