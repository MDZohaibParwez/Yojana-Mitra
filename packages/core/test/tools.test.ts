import { beforeEach, describe, expect, it } from "vitest";
import {
  checkEligibility,
  compareSchemes,
  documentChecklist,
  findSchemes,
  getScheme,
  InMemoryRepository,
  reportIssue,
  ToolError,
  upcomingDeadlines,
  type SchemeRecord,
  type ToolContext,
} from "../src/index.js";
import { loadSeedRecords } from "./fixtures.js";

const NOW = new Date("2026-11-20T00:00:00Z");

function withDeadlines(records: SchemeRecord[]): SchemeRecord[] {
  return records.map((r) => {
    if (r.slug === "post-matric-scholarship-sc") return { ...r, deadline: "2026-11-30" };
    if (r.slug === "pmfby") return { ...r, deadline: "2026-12-31" };
    if (r.slug === "pm-yasasvi-post-matric-obc") return { ...r, deadline: "2026-10-01" }; // past
    return r;
  });
}

let repo: InMemoryRepository;
let ctx: ToolContext;
beforeEach(() => {
  repo = new InMemoryRepository(withDeadlines(loadSeedRecords()));
  ctx = { repo, channel: "mcp", now: NOW };
});

const farmer = { age: 42, gender: "male", state: "GJ", socialCategory: "SC", occupation: "farmer", annualIncome: 150000, landHoldingHectares: 1.2, isIncomeTaxPayer: false, area: "rural" } as const;

describe("find_schemes", () => {
  it("returns confirmed matches first with reasons and citations", async () => {
    const r = await findSchemes(ctx, { profile: farmer });
    expect(r.totalEligible).toBeGreaterThan(3);
    const first = r.results[0]!;
    expect(first.eligible).toBe(true);
    expect(first.reason.length).toBeGreaterThan(3);
    for (const item of r.results) {
      expect(item.sourceUrl).toMatch(/^https:\/\//);
      expect(item.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const idxYes = r.results.findIndex((x) => x.eligible === "maybe");
    if (idxYes > -1) expect(r.results.slice(idxYes).every((x) => x.eligible === "maybe")).toBe(true);
    expect(r.results.map((x) => x.slug)).toContain("pm-kisan");
    expect(r.results.map((x) => x.slug)).not.toContain("pm-kmy"); // age 42 > 40
    expect(r.disclaimer).toMatch(/final decision/i);
  });
  it("asks for the most useful missing field", async () => {
    const r = await findSchemes(ctx, { profile: { state: "UP" } });
    expect(r.totalEligible).toBe(0);
    expect(r.askNext[0]!.field).toBe("age");
    expect(r.askNext[0]!.question).toMatch(/age/i);
  });
  it("filters by free-text query, in Hindi too", async () => {
    const r = await findSchemes(ctx, { profile: { age: 65, hasBplCard: true }, query: "pension" });
    expect(r.results.map((x) => x.slug)).toContain("ignoaps");
    expect(r.results.every((x) => /pension/i.test(x.name + x.shortDescription + x.category) || x.slug.includes("pension") || x.category === "pension")).toBe(true);
    const hi = await findSchemes(ctx, { profile: { occupation: "farmer" }, query: "किसान", lang: "hi" });
    expect(hi.results.map((x) => x.slug)).toContain("pm-kisan");
    expect(hi.results[0]!.name).toMatch(/[ऀ-ॿ]/);
  });
  it("includeMaybe=false returns only confirmed matches", async () => {
    const r = await findSchemes(ctx, { profile: farmer, includeMaybe: false });
    expect(r.results.every((x) => x.eligible === true)).toBe(true);
  });
  it("rejects sensitive data and unknown fields", async () => {
    await expect(findSchemes(ctx, { profile: { district: "ABCPE1234F" } })).rejects.toMatchObject({ code: "sensitive_data" });
    await expect(findSchemes(ctx, { profile: { aadhaar: "1" } })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(findSchemes(ctx, { profile: { age: -3 } })).rejects.toBeInstanceOf(ToolError);
  });
  it("records an anonymous usage event", async () => {
    await findSchemes(ctx, { profile: farmer, lang: "hi" });
    expect(repo.usage).toHaveLength(1);
    expect(repo.usage[0]).toMatchObject({ channel: "mcp", tool: "find_schemes", state: "GJ", lang: "hi" });
    expect(Object.keys(repo.usage[0]!).sort()).toEqual(["at", "channel", "lang", "schemeIds", "state", "tool"]);
  });
});

describe("get_scheme", () => {
  it("returns full detail with citation", async () => {
    const r = await getScheme(ctx, { idOrSlug: "pm-kisan" });
    expect(r.name).toContain("PM-KISAN");
    expect(r.howToApplySteps.length).toBeGreaterThan(0);
    expect(r.documentsRequired.length).toBeGreaterThan(0);
    expect(r.officialApplyUrl).toBe("https://pmkisan.gov.in/");
    expect(r.lastVerifiedAt).toBe("2026-11-01");
  });
  it("localises and falls back to English for missing languages", async () => {
    expect((await getScheme(ctx, { idOrSlug: "pm-kisan", lang: "hi" })).contentLang).toBe("hi");
    expect((await getScheme(ctx, { idOrSlug: "pm-kisan", lang: "ta" })).contentLang).toBe("en");
  });
  it("is case-insensitive and errors helpfully for unknown slugs", async () => {
    expect((await getScheme(ctx, { idOrSlug: "PM-KISAN" })).slug).toBe("pm-kisan");
    await expect(getScheme(ctx, { idOrSlug: "made-up-yojana" })).rejects.toThrow(/find_schemes/);
  });
});

describe("check_eligibility", () => {
  it("yes with passed reasons", async () => {
    const r = await checkEligibility(ctx, { schemeId: "pm-kisan", profile: farmer });
    expect(r.eligible).toBe(true);
    expect(r.passed.length).toBeGreaterThan(2);
    expect(r.failed).toEqual([]);
    expect(r.sourceUrl).toBeDefined();
  });
  it("no with exact failure reason", async () => {
    const r = await checkEligibility(ctx, { schemeId: "atal-pension-yojana", profile: farmer });
    expect(r.eligible).toBe(false);
    expect(r.failed[0]).toMatch(/Age: 42 years/);
  });
  it("maybe with questions to ask", async () => {
    const r = await checkEligibility(ctx, { schemeId: "ignwps", profile: { gender: "female", maritalStatus: "widowed" }, lang: "hinglish" });
    expect(r.eligible).toBe("maybe");
    expect(r.missing.map((m) => m.field)).toEqual(["age", "hasBplCard"]);
    expect(r.missing[0]!.question).toMatch(/umar/i);
  });
});

describe("compare_schemes", () => {
  it("compares side by side with eligibility", async () => {
    const r = await compareSchemes(ctx, { ids: ["pm-sym", "atal-pension-yojana", "pm-kmy"], profile: { age: 30, occupation: "farmer", landHoldingHectares: 1, isIncomeTaxPayer: false, annualIncome: 100000 } });
    expect(r.schemes).toHaveLength(3);
    const byslug = Object.fromEntries(r.schemes.map((s) => [s.slug, s]));
    expect(byslug["pm-kmy"]!.eligibility!.eligible).toBe(true);
    expect(byslug["pm-sym"]!.eligibility!.eligible).toBe(false); // farmer not in PM-SYM occupation list
    expect(byslug["atal-pension-yojana"]!.levelLabel).toBe("Central Government");
  });
  it("needs at least two ids", async () => {
    await expect(compareSchemes(ctx, { ids: ["pm-sym"] })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("document_checklist", () => {
  it("merges and de-duplicates documents across schemes", async () => {
    const r = await documentChecklist(ctx, { schemeIds: ["pm-kisan", "pm-kmy", "kisan-credit-card"] });
    const aadhaar = r.documents.filter((d) => /aadhaar/i.test(d.document));
    expect(aadhaar).toHaveLength(1);
    expect(aadhaar[0]!.neededFor).toHaveLength(3);
    expect(r.documents[0]!.neededFor.length).toBeGreaterThanOrEqual(r.documents.at(-1)!.neededFor.length);
  });
  it("works from a profile", async () => {
    const r = await documentChecklist(ctx, { profile: farmer, lang: "hi" });
    expect(r.schemes.length).toBeGreaterThan(2);
    expect(r.documents.some((d) => d.document.includes("आधार"))).toBe(true);
  });
  it("requires profile or schemeIds", async () => {
    await expect(documentChecklist(ctx, {})).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("upcoming_deadlines", () => {
  it("lists only future deadlines within the window, soonest first", async () => {
    const r = await upcomingDeadlines(ctx, { days: 60 });
    expect(r.results.map((x) => x.slug)).toEqual(["post-matric-scholarship-sc", "pmfby"]);
    expect(r.results[0]!.daysLeft).toBe(10);
    const short = await upcomingDeadlines(ctx, { days: 15 });
    expect(short.results.map((x) => x.slug)).toEqual(["post-matric-scholarship-sc"]);
  });
  it("defaults to 30 days and empty input", async () => {
    const r = await upcomingDeadlines(ctx, undefined);
    expect(r.days).toBe(30);
    expect(r.header).toMatch(/30 days/);
  });
});

describe("report_issue", () => {
  it("stores a redacted report", async () => {
    const r = await reportIssue(ctx, { schemeId: "pm-kisan", message: "The amount is outdated, call me on 9876543210" });
    expect(r.status).toBe("open");
    expect(repo.reports[0]!.message).not.toContain("9876543210");
  });
  it("rejects Aadhaar in reports and unknown schemes", async () => {
    await expect(reportIssue(ctx, { schemeId: "pm-kisan", message: "my aadhaar 2341 2341 2346 not linked" })).rejects.toMatchObject({ code: "sensitive_data" });
    await expect(reportIssue(ctx, { schemeId: "nope", message: "wrong info here" })).rejects.toMatchObject({ code: "not_found" });
  });
});
