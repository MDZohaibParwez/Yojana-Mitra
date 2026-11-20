import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryRepository } from "@ym/core";
import { closeDb, getDb, loadSeedFiles, runMigrations, upsertScheme, schema, PgRepository, type Db } from "@ym/db";
import { createApp } from "../src/app.js";
import { adminRoutes, hashKey } from "../src/admin.js";
import { OPENAPI } from "../src/openapi.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const KEY = "ym_" + "a".repeat(43);
const READ_KEY = "ym_" + "r".repeat(43);
const JWT_SECRET = "s".repeat(40);

describe("OpenAPI spec", () => {
  it("documents every admin route", () => {
    const paths = Object.keys(OPENAPI.paths);
    for (const p of ["/admin/v1/schemes", "/admin/v1/schemes/{id}", "/admin/v1/review/rules", "/admin/v1/review/reports", "/admin/v1/review/links", "/admin/v1/stats", "/admin/v1/auth/token"])
      expect(paths).toContain(p);
    expect(OPENAPI.openapi).toBe("3.1.0");
  });
});

describe.skipIf(!TEST_DB)("Admin API (Postgres)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  const auth = (k = KEY) => ({ authorization: `Bearer ${k}`, "content-type": "application/json" });

  beforeAll(async () => {
    await closeDb();
    const { sql, db: d } = getDb(TEST_DB);
    await sql.unsafe("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
    await runMigrations();
    db = d;
    for (const s of loadSeedFiles().slice(0, 5)) await upsertScheme(db, s, { generatedBy: "llm", model: "test" });
    await db.insert(schema.adminApiKeys).values({ name: "reader", keyHash: hashKey(READ_KEY), scopes: ["read"] });
    const repo = new PgRepository(db, { cacheTtlMs: 0 });
    app = createApp({ repo: () => repo, admin: adminRoutes({ db: () => db, jwtSecret: JWT_SECRET, envKeyHashes: [hashKey(KEY)] }), rateLimitPerMinute: 10_000 });
  });
  afterAll(closeDb);

  it("requires a valid token", async () => {
    expect((await app.request("/admin/v1/schemes")).status).toBe(401);
    expect((await app.request("/admin/v1/schemes", { headers: auth("ym_wrong_key_wrong_key_wrong") })).status).toBe(401);
    expect((await app.request("/admin/v1/openapi.json")).status).toBe(200);
  });

  it("lists schemes and the review queue", async () => {
    const list = await (await app.request("/admin/v1/schemes?reviewStatus=pending", { headers: auth() })).json();
    expect(list.total).toBe(5);
    const summary = await (await app.request("/admin/v1/review/summary", { headers: auth() })).json();
    expect(summary.pending_rules).toBe(5);
    const rules = await (await app.request("/admin/v1/review/rules", { headers: auth() })).json();
    expect(rules.items[0].sourceText === null || typeof rules.items[0].sourceText === "string").toBe(true);
  });

  it("enforces scopes", async () => {
    expect((await app.request("/admin/v1/schemes", { headers: auth(READ_KEY) })).status).toBe(200);
    expect((await app.request("/admin/v1/schemes/pm-kisan/approve", { method: "POST", headers: auth(READ_KEY), body: "{}" })).status).toBe(403);
  });

  it("approve makes a scheme visible to the public API", async () => {
    expect((await app.request("/v1/schemes/pm-kisan")).status).toBe(404);
    const r = await app.request("/admin/v1/schemes/pm-kisan/approve", { method: "POST", headers: auth(), body: JSON.stringify({ notes: "checked against pmkisan.gov.in" }) });
    expect(r.status).toBe(200);
    expect((await app.request("/v1/schemes/pm-kisan")).status).toBe(200);
  });

  it("editing puts the scheme back to pending (hidden) until re-approved", async () => {
    const r = await app.request("/admin/v1/schemes/pm-kisan", { method: "PATCH", headers: auth(), body: JSON.stringify({ benefitValueInr: 6000, deadline: "2026-12-31" }) });
    expect(r.status).toBe(200);
    expect((await r.json()).reviewStatus).toBe("pending");
    expect((await app.request("/v1/schemes/pm-kisan")).status).toBe(404);
    const r2 = await app.request("/admin/v1/schemes/pm-kisan", { method: "PATCH", headers: auth(), body: JSON.stringify({ approve: true }) });
    expect((await r2.json()).reviewStatus).toBe("approved");
  });

  it("validates input", async () => {
    expect((await app.request("/admin/v1/schemes/pm-kisan", { method: "PATCH", headers: auth(), body: JSON.stringify({ officialApplyUrl: "http://insecure" }) })).status).toBe(400);
    expect((await app.request("/admin/v1/schemes/pm-kisan/rules", { method: "POST", headers: auth(), body: JSON.stringify({ rule: { field: "aadhaar", op: "eq", value: 1 } }) })).status).toBe(400);
    expect((await app.request("/admin/v1/schemes/pm-kisan/reject", { method: "POST", headers: auth(), body: "{}" })).status).toBe(400);
  });

  it("new rule versions are pending; preview evaluates without side effects", async () => {
    const rule = { all: [{ field: "occupation", op: "eq", value: "farmer" }, { field: "age", op: "gte", value: 18 }] };
    const pv = await (await app.request("/admin/v1/schemes/pm-kisan/rules/preview", { method: "POST", headers: auth(), body: JSON.stringify({ rule, profile: { occupation: "farmer" } }) })).json();
    expect(pv.eligible).toBe("maybe");
    const r = await app.request("/admin/v1/schemes/pm-kisan/rules", { method: "POST", headers: auth(), body: JSON.stringify({ rule, sourceText: "test" }) });
    expect(r.status).toBe(201);
    expect((await r.json()).reviewStatus).toBe("pending");
    const dup = await app.request("/admin/v1/schemes/pm-kisan/rules", { method: "POST", headers: auth(), body: JSON.stringify({ rule }) });
    expect(dup.status).toBe(409);
  });

  it("reports workflow", async () => {
    await app.request("/v1/schemes/pm-kisan/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Helpline number seems wrong" }) });
    const list = await (await app.request("/admin/v1/review/reports?status=open", { headers: auth() })).json();
    expect(list.items).toHaveLength(1);
    const id = list.items[0].report.id;
    const upd = await app.request(`/admin/v1/reports/${id}`, { method: "PATCH", headers: auth(), body: JSON.stringify({ status: "resolved", resolutionNote: "fixed" }) });
    expect((await upd.json()).status).toBe("resolved");
  });

  it("stats from anonymous counters only", async () => {
    await app.request("/v1/schemes/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: { state: "GJ", occupation: "farmer" }, lang: "hi" }) });
    const s = await (await app.request("/admin/v1/stats?days=7", { headers: auth() })).json();
    expect(s.eligibilityChecks).toBeGreaterThanOrEqual(1);
    expect(s.topStates[0].state).toBe("GJ");
    expect(s.weeklyByChannel[0].channel).toBe("api");
    expect(Array.isArray(s.topSchemes)).toBe(true);
  });

  it("JWT exchange", async () => {
    const t = await (await app.request("/admin/v1/auth/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: KEY }) })).json();
    expect(t.token).toBeTruthy();
    const me = await (await app.request("/admin/v1/me", { headers: auth(t.token) })).json();
    expect(me.scopes).toEqual(["read", "write", "review"]);
    expect((await app.request("/admin/v1/me", { headers: auth(t.token + "x") })).status).toBe(401);
  });

  it("link issues list", async () => {
    await db.update(schema.schemes).set({ linkStatus: "broken" }).where((await import("drizzle-orm")).eq(schema.schemes.slug, "pm-jay"));
    const r = await (await app.request("/admin/v1/review/links", { headers: auth() })).json();
    expect(r.items.map((x: { slug: string }) => x.slug)).toContain("pm-jay");
  });
});

// keep import used when DB tests are skipped
void InMemoryRepository;
