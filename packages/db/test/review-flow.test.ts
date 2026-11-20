import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findSchemes } from "@ym/core";
import { approveRule, approveScheme, closeDb, getSchemeAdmin, listPendingRules, loadSeedFiles, PgRepository, upsertScheme, usageStats, type Db } from "../src/index.js";
import { resetTestDb, TEST_DB } from "./helpers.js";

describe.skipIf(!TEST_DB)("pending-review flow (Postgres)", () => {
  let db: Db;
  const seeds = loadSeedFiles();
  const kisan = seeds.find((s) => s.slug === "pm-kisan")!;

  beforeAll(async () => {
    db = (await resetTestDb()).db;
  });
  afterAll(closeDb);

  it("new schemes and rules are pending and invisible to users", async () => {
    await upsertScheme(db, kisan, { generatedBy: "llm", model: "test-model" });
    const repo = new PgRepository(db, { cacheTtlMs: 0 });
    expect(await repo.listSchemes()).toHaveLength(0);
    expect(await repo.getScheme("pm-kisan")).toBeNull();
    expect((await listPendingRules(db)).map((r) => r.slug)).toEqual(["pm-kisan"]);
  });

  it("approved rule alone is not enough — scheme must be approved too", async () => {
    const [p] = await listPendingRules(db);
    await approveRule(db, p!.ruleId, { reviewer: "tester" });
    const repo = new PgRepository(db, { cacheTtlMs: 0 });
    expect(await repo.listSchemes()).toHaveLength(0);
    const d = await getSchemeAdmin(db, "pm-kisan");
    await approveScheme(db, d!.scheme.id, { reviewer: "tester" });
    const visible = await repo.listSchemes();
    expect(visible.map((s) => s.slug)).toEqual(["pm-kisan"]);
    expect(visible[0]!.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(visible[0]!.text.hi?.name).toContain("किसान");
  });

  it("re-importing changed content hides the scheme again; new rule version is pending", async () => {
    const changed = { ...kisan, text: { ...kisan.text, en: { ...kisan.text.en!, benefits: "Changed benefits text for test" } }, rule: { field: "occupation", op: "eq", value: "farmer" } as const };
    const r = await upsertScheme(db, changed, { generatedBy: "llm" });
    expect(r.changed).toBe(true);
    expect(r.ruleVersion).toBe(2);
    const repo = new PgRepository(db, { cacheTtlMs: 0 });
    expect(await repo.listSchemes()).toHaveLength(0);
  });

  it("unchanged re-import is a no-op", async () => {
    const d = await getSchemeAdmin(db, "pm-kisan");
    const r = await upsertScheme(db, { ...kisan, text: { ...kisan.text, en: { ...kisan.text.en!, benefits: "Changed benefits text for test" } }, rule: { field: "occupation", op: "eq", value: "farmer" } }, { generatedBy: "llm" });
    expect(r.changed).toBe(false);
    expect(r.ruleVersion).toBeNull();
    expect((await getSchemeAdmin(db, "pm-kisan"))!.rules).toHaveLength(d!.rules.length);
  });

  it("DB rejects an approved rule without reviewer", async () => {
    const d = await getSchemeAdmin(db, "pm-kisan");
    await expect(
      db.execute(`update eligibility_rules set review_status='approved', reviewed_by=null where id='${d!.rules[0]!.id}'` as never),
    ).rejects.toThrow();
  });

  it("tools work end-to-end against Postgres and only write anonymous counters", async () => {
    for (const s of seeds) {
      const r = await upsertScheme(db, s, { generatedBy: "curated" });
      const d = await getSchemeAdmin(db, s.slug);
      for (const rule of d!.rules.filter((x) => x.reviewStatus === "pending")) await approveRule(db, rule.id, { reviewer: "tester" });
      await approveScheme(db, r.schemeId, { reviewer: "tester" });
    }
    const repo = new PgRepository(db, { cacheTtlMs: 0 });
    const out = await findSchemes({ repo, channel: "api" }, { profile: { age: 30, occupation: "farmer", landHoldingHectares: 1, isIncomeTaxPayer: false }, query: "pension" });
    expect(out.results.map((r) => r.slug)).toContain("pm-kmy");
    const stats = await usageStats(db);
    expect(stats.byTool.find((t) => t.tool === "find_schemes")?.events).toBe(1);
    const cols = await db.execute<{ column_name: string }>("select column_name from information_schema.columns where table_name='usage_events'" as never);
    expect(cols.map((c) => c.column_name).sort()).toEqual(["channel", "created_at", "id", "lang", "state_code", "tool"]);
  });
});
