import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { evaluate, LANGS, parseRule, ProfileSchema, RateLimiter, SCHEME_CATEGORIES, SchemeTextSchema, STATE_CODES } from "@ym/core";
import {
  addRuleVersion,
  approveRule,
  approveScheme,
  getDb,
  getSchemeAdmin,
  listLinkIssues,
  listPendingRules,
  listReports,
  listSchemesAdmin,
  purgeExpiredSessions,
  rejectRule,
  rejectScheme,
  reviewQueueCounts,
  schema,
  topSchemes,
  updateReport,
  usageStats,
  type Db,
} from "@ym/db";
import { OPENAPI } from "./openapi.js";

export type Scope = "read" | "write" | "review";
export interface Principal {
  name: string;
  scopes: Scope[];
}
type Env = { Variables: { principal: Principal } };

export const ALL_SCOPES: Scope[] = ["read", "write", "review"];
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface AdminDeps {
  db: () => Db;
  jwtSecret?: string;
  envKeyHashes?: string[];
}

class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 429,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function principalFromApiKey(deps: AdminDeps, key: string): Promise<Principal | null> {
  const h = hashKey(key);
  if ((deps.envKeyHashes ?? []).some((x) => safeEqualHex(x, h))) return { name: "env-key", scopes: ALL_SCOPES };
  const row = await deps
    .db()
    .query.adminApiKeys.findFirst({ where: and(eq(schema.adminApiKeys.keyHash, h), isNull(schema.adminApiKeys.revokedAt)) });
  if (!row) return null;
  void deps.db().update(schema.adminApiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.adminApiKeys.id, row.id)).catch(() => {});
  return { name: row.name, scopes: row.scopes.filter((s): s is Scope => (ALL_SCOPES as string[]).includes(s)) };
}

function requireScope(scope: Scope): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (!c.get("principal").scopes.includes(scope)) throw new HttpError(403, "forbidden", `This key lacks the "${scope}" scope`);
    await next();
  };
}

async function json<T extends z.ZodTypeAny>(c: Context, schemaDef: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Body must be valid JSON");
  }
  const r = schemaDef.safeParse(body);
  if (!r.success) throw new HttpError(400, "invalid_input", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

const Pagination = { limit: z.coerce.number().int().min(1).max(200).optional(), offset: z.coerce.number().int().min(0).optional() };

const SchemePatch = z
  .object({
    ministry: z.string().min(2).max(300),
    category: z.enum(SCHEME_CATEGORIES),
    level: z.enum(["central", "state"]),
    stateCode: z.enum(STATE_CODES).nullable(),
    tags: z.array(z.string().max(60)).max(30),
    officialApplyUrl: z.string().url().startsWith("https://"),
    sourceUrl: z.string().url().startsWith("https://"),
    status: z.enum(["active", "closed", "unknown"]),
    deadline: z.string().date().nullable(),
    benefitValueInr: z.number().int().nonnegative().nullable(),
    name: z.record(z.enum(LANGS), z.string().min(2).max(300)),
    shortDescription: z.string().min(10).max(1000),
    benefits: z.string().min(5).max(3000),
    howToApplySteps: z.array(z.string().min(3).max(1000)).min(1).max(20),
    documentsRequired: z.array(z.string().min(2).max(300)).max(30),
    approve: z.boolean(),
    notes: z.string().max(2000),
  })
  .partial()
  .strict();

const Decision = z.object({ notes: z.string().max(2000).optional() }).strict();
const RejectDecision = z.object({ notes: z.string().min(3).max(2000) }).strict();

export function adminRoutes(deps: AdminDeps = defaultAdminDeps()) {
  const app = new Hono<Env>();
  const limiter = new RateLimiter(Number(process.env.ADMIN_RATE_LIMIT_PER_MINUTE ?? 300));
  const jwtSecret = deps.jwtSecret;

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    console.error("[admin] error:", err.name, err.message.slice(0, 200));
    return c.json({ error: { code: "internal", message: "Internal error" } }, 500);
  });

  // Public: the spec, so the separate admin panel can generate a client.
  app.get("/openapi.json", (c) => c.json(OPENAPI));

  // Vercel Cron: authenticated with CRON_SECRET, not an admin key.
  app.get("/cron/cleanup", async (c) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || c.req.header("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "unauthorized", "Invalid cron secret");
    return c.json({ purgedSessions: await purgeExpiredSessions(deps.db()) });
  });

  // Exchange an API key for a short-lived JWT (15 min) — lets the panel avoid holding the key in the browser.
  app.post("/auth/token", async (c) => {
    if (!jwtSecret || jwtSecret.length < 32) throw new HttpError(400, "jwt_disabled", "ADMIN_JWT_SECRET (min 32 chars) is not configured");
    const { apiKey } = await json(c, z.object({ apiKey: z.string().min(20).max(200) }).strict());
    const p = await principalFromApiKey(deps, apiKey);
    if (!p) throw new HttpError(401, "unauthorized", "Invalid API key");
    const exp = Math.floor(Date.now() / 1000) + 15 * 60;
    return c.json({ token: await sign({ sub: p.name, scopes: p.scopes, exp, iss: "yojana-mitra" }, jwtSecret, "HS256"), expiresAt: new Date(exp * 1000).toISOString() });
  });

  // Everything below requires a principal.
  app.use("*", async (c, next) => {
    const auth = c.req.header("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) throw new HttpError(401, "unauthorized", "Missing Bearer token (API key or JWT)");
    if (!limiter.check(hashKey(token)).allowed) throw new HttpError(429, "rate_limited", "Too many requests");
    let p: Principal | null = null;
    if (token.startsWith("ym_")) p = await principalFromApiKey(deps, token);
    else if (jwtSecret) {
      try {
        const payload = (await verify(token, jwtSecret, "HS256")) as { sub: string; scopes: Scope[]; iss?: string };
        if (payload.iss === "yojana-mitra") p = { name: payload.sub, scopes: payload.scopes };
      } catch {
        p = null;
      }
    }
    if (!p) throw new HttpError(401, "unauthorized", "Invalid or expired token");
    c.set("principal", p);
    await next();
  });

  app.get("/me", (c) => c.json(c.get("principal")));

  /* ------------------------------ Schemes ------------------------------ */
  app.get("/schemes", requireScope("read"), async (c) => {
    const q = z
      .object({
        q: z.string().max(100).optional(),
        level: z.enum(["central", "state"]).optional(),
        state: z.enum(STATE_CODES).optional(),
        reviewStatus: z.enum(["pending", "approved", "rejected"]).optional(),
        linkStatus: z.enum(["unchecked", "ok", "changed", "broken"]).optional(),
        category: z.enum(SCHEME_CATEGORIES).optional(),
        ...Pagination,
      })
      .safeParse(c.req.query());
    if (!q.success) throw new HttpError(400, "invalid_input", q.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return c.json(await listSchemesAdmin(deps.db(), q.data));
  });

  app.get("/schemes/:id", requireScope("read"), async (c) => {
    const d = await getSchemeAdmin(deps.db(), c.req.param("id"));
    if (!d) throw new HttpError(404, "not_found", "Scheme not found");
    return c.json(d);
  });

  app.patch("/schemes/:id", requireScope("write"), async (c) => {
    const body = await json(c, SchemePatch);
    const db = deps.db();
    const d = await getSchemeAdmin(db, c.req.param("id"));
    if (!d) throw new HttpError(404, "not_found", "Scheme not found");
    const { approve, notes, ...fields } = body;
    if (fields.level === "state" && !(fields.stateCode ?? d.scheme.stateCode)) throw new HttpError(400, "invalid_input", "state schemes need stateCode");
    if (approve && !c.get("principal").scopes.includes("review")) throw new HttpError(403, "forbidden", 'approve requires the "review" scope');
    const name = fields.name ? { ...d.scheme.name, ...fields.name } : undefined;
    await db
      .update(schema.schemes)
      .set({ ...fields, ...(name ? { name } : {}), reviewStatus: "pending", updatedAt: new Date() })
      .where(eq(schema.schemes.id, d.scheme.id));
    await db.insert(schema.verificationEvents).values({ schemeId: d.scheme.id, kind: "edited", detail: { by: c.get("principal").name, fields: Object.keys(fields), notes: notes ?? null } });
    if (approve) await approveScheme(db, d.scheme.id, { reviewer: c.get("principal").name, notes, translations: false });
    return c.json((await getSchemeAdmin(db, d.scheme.id))!.scheme);
  });

  app.put("/schemes/:id/translations/:lang", requireScope("write"), async (c) => {
    const lang = c.req.param("lang");
    if (!(LANGS as readonly string[]).includes(lang) || lang === "en") throw new HttpError(400, "invalid_input", "lang must be a supported non-English language");
    const body = await json(c, SchemeTextSchema.extend({ approve: z.boolean().optional() }));
    const db = deps.db();
    const d = await getSchemeAdmin(db, c.req.param("id"));
    if (!d) throw new HttpError(404, "not_found", "Scheme not found");
    const { approve, ...text } = body;
    if (approve && !c.get("principal").scopes.includes("review")) throw new HttpError(403, "forbidden", 'approve requires the "review" scope');
    const values = { ...text, translatedBy: "human" as const, reviewStatus: approve ? ("approved" as const) : ("pending" as const), updatedAt: new Date() };
    await db
      .insert(schema.schemeTranslations)
      .values({ schemeId: d.scheme.id, lang, ...values })
      .onConflictDoUpdate({ target: [schema.schemeTranslations.schemeId, schema.schemeTranslations.lang], set: values });
    return c.json({ ok: true, reviewStatus: values.reviewStatus });
  });

  app.post("/schemes/:id/rules", requireScope("write"), async (c) => {
    const body = await json(c, z.object({ rule: z.unknown(), sourceText: z.string().max(20000).optional(), notes: z.string().max(2000).optional() }).strict());
    let rule;
    try {
      rule = parseRule(body.rule);
    } catch (e) {
      throw new HttpError(400, "invalid_rule", (e as Error).message.slice(0, 2000));
    }
    const db = deps.db();
    const d = await getSchemeAdmin(db, c.req.param("id"));
    if (!d) throw new HttpError(404, "not_found", "Scheme not found");
    const version = await addRuleVersion(db, d.scheme.id, rule, { generatedBy: "human", sourceText: body.sourceText ?? null });
    if (version === null) throw new HttpError(409, "unchanged", "Rule is identical to the latest version");
    return c.json({ version, reviewStatus: "pending" }, 201);
  });

  app.post("/schemes/:id/rules/preview", requireScope("read"), async (c) => {
    const body = await json(c, z.object({ rule: z.unknown(), profile: ProfileSchema }).strict());
    try {
      return c.json(evaluate(body.profile, parseRule(body.rule)));
    } catch (e) {
      throw new HttpError(400, "invalid_rule", (e as Error).message.slice(0, 2000));
    }
  });

  app.post("/schemes/:id/approve", requireScope("review"), async (c) => {
    const { notes } = await json(c, Decision);
    const db = deps.db();
    const d = await getSchemeAdmin(db, c.req.param("id"));
    if (!d) throw new HttpError(404, "not_found", "Scheme not found");
    const pending = d.rules.find((r) => r.reviewStatus === "pending");
    if (!pending && !d.rules.some((r) => r.reviewStatus === "approved")) throw new HttpError(409, "no_rule", "Scheme has no rule to approve");
    const reviewer = c.get("principal").name;
    if (pending) await approveRule(db, pending.id, { reviewer, notes });
    await approveScheme(db, d.scheme.id, { reviewer, notes });
    return c.json({ ok: true, approvedRuleVersion: pending?.version ?? null });
  });

  app.post("/schemes/:id/reject", requireScope("review"), async (c) => {
    const { notes } = await json(c, RejectDecision);
    const db = deps.db();
    const d = await getSchemeAdmin(db, c.req.param("id"));
    if (!d) throw new HttpError(404, "not_found", "Scheme not found");
    await rejectScheme(db, d.scheme.id, { reviewer: c.get("principal").name, notes });
    return c.json({ ok: true });
  });

  /* ------------------------------ Review queue ------------------------------ */
  app.get("/review/summary", requireScope("read"), async (c) => c.json(await reviewQueueCounts(deps.db())));

  app.get("/review/rules", requireScope("read"), async (c) => {
    const q = z.object(Pagination).parse(c.req.query());
    return c.json({ items: await listPendingRules(deps.db(), q.limit, q.offset) });
  });

  app.post("/rules/:ruleId/approve", requireScope("review"), async (c) => {
    const { notes, alsoApproveScheme } = await json(c, Decision.extend({ alsoApproveScheme: z.boolean().optional() }));
    try {
      return c.json(await approveRule(deps.db(), c.req.param("ruleId"), { reviewer: c.get("principal").name, notes, alsoApproveScheme }));
    } catch (e) {
      throw new HttpError(404, "not_found", (e as Error).message);
    }
  });

  app.post("/rules/:ruleId/reject", requireScope("review"), async (c) => {
    const { notes } = await json(c, RejectDecision);
    await rejectRule(deps.db(), c.req.param("ruleId"), { reviewer: c.get("principal").name, notes });
    return c.json({ ok: true });
  });

  app.get("/review/reports", requireScope("read"), async (c) => {
    const q = z.object({ status: z.enum(["open", "in_review", "resolved", "rejected"]).optional(), ...Pagination }).parse(c.req.query());
    return c.json({ items: await listReports(deps.db(), q.status, q.limit, q.offset) });
  });

  app.patch("/reports/:id", requireScope("review"), async (c) => {
    const body = await json(c, z.object({ status: z.enum(["open", "in_review", "resolved", "rejected"]), resolutionNote: z.string().max(2000).optional() }).strict());
    const row = await updateReport(deps.db(), c.req.param("id"), body.status, body.resolutionNote);
    if (!row) throw new HttpError(404, "not_found", "Report not found");
    return c.json(row);
  });

  app.get("/review/links", requireScope("read"), async (c) => {
    const q = z.object(Pagination).parse(c.req.query());
    return c.json({ items: await listLinkIssues(deps.db(), q.limit, q.offset) });
  });

  /* ------------------------------ Stats ------------------------------ */
  app.get("/stats", requireScope("read"), async (c) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).optional() }).parse(c.req.query());
    const db = deps.db();
    const [usage, top] = await Promise.all([usageStats(db, { days: days ?? 28 }), topSchemes(db, 10)]);
    return c.json({ ...usage, topSchemes: [...top] });
  });

  return app;
}

export function defaultAdminDeps(): AdminDeps {
  return {
    db: () => getDb().db,
    jwtSecret: process.env.ADMIN_JWT_SECRET,
    envKeyHashes: (process.env.ADMIN_API_KEY_HASHES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}
