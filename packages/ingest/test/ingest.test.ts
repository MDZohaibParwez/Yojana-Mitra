import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateBenefitInr, extractLinks, extractSections, normalize, parseMySchemePage, parseRobots, parseSitemap, robotsAllows, slugify, toList, PoliteFetcher, RobotsDisallowedError, buildSeed } from "../src/index.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

describe("robots.txt", () => {
  const txt = `User-agent: *\nDisallow: /admin\nDisallow: /search?\nAllow: /admin/public\nCrawl-delay: 5\n\nUser-agent: BadBot\nDisallow: /`;
  const rules = parseRobots(txt);
  it("parses groups and crawl-delay", () => {
    expect(rules.crawlDelayMs).toBe(5000);
    expect(robotsAllows(rules, "/schemes/x")).toBe(true);
    expect(robotsAllows(rules, "/admin/secret")).toBe(false);
    expect(robotsAllows(rules, "/admin/public/page")).toBe(true);
    expect(robotsAllows(rules, "/search?q=1")).toBe(false);
  });
  it("fetcher refuses disallowed paths and non-https", async () => {
    const fake: typeof fetch = async (url) =>
      new Response(String(url).endsWith("/robots.txt") ? "User-agent: *\nDisallow: /private" : "<html></html>", { status: 200 });
    const f = new PoliteFetcher({ fetchImpl: fake, minDelayMs: 0, sleep: async () => {} });
    await expect(f.fetch("https://example.gov.in/private/x")).rejects.toBeInstanceOf(RobotsDisallowedError);
    await expect(f.fetch("http://example.gov.in/")).rejects.toThrow(/non-https/);
    expect((await f.fetch("https://example.gov.in/ok")).status).toBe(200);
  });
  it("fetcher retries 5xx then returns", async () => {
    let n = 0;
    const fake: typeof fetch = async (url) => {
      if (String(url).endsWith("/robots.txt")) return new Response("", { status: 404 });
      n++;
      return new Response("x", { status: n < 2 ? 503 : 200 });
    };
    const f = new PoliteFetcher({ fetchImpl: fake, minDelayMs: 0, sleep: async () => {} });
    expect((await f.fetch("https://example.gov.in/a")).status).toBe(200);
    expect(n).toBe(2);
  });
});

describe("parsers", () => {
  it("myScheme __NEXT_DATA__ page", () => {
    const r = parseMySchemePage(fx("myscheme-synthetic.html"), "https://www.myscheme.gov.in/schemes/example-kss")!;
    expect(r.name).toBe("Example Kisan Support Scheme");
    expect(r.level).toBe("state");
    expect(r.stateCode).toBe("GJ");
    expect(r.sections.eligibility).toMatch(/farmer resident of Gujarat/);
    expect(r.sections.benefits).toMatch(/12,000/);
    expect(r.sections.exclusions).toMatch(/Income tax/);
    expect(r.sections.applicationProcess).toMatch(/Register on the portal/);
  });
  it("heading-based state portal page", () => {
    const s = extractSections(fx("state-portal-synthetic.html"));
    expect(s.title).toBe("Mukhyamantri Example Pension Yojana");
    expect(s.eligibility).toMatch(/Age 60/);
    expect(toList(s.documents)).toEqual(["Aadhaar card", "Age proof"]);
    expect(toList(s.applicationProcess)).toEqual(["Visit the block office", "Submit the form"]);
  });
  it("extracts only https links matching the pattern", () => {
    expect(extractLinks(fx("state-portal-synthetic.html"), "https://state.gov.in/list", /\/schemes\//)).toEqual(["https://state.gov.in/schemes/one"]);
  });
  it("sitemap", () => {
    expect(parseSitemap("<urlset><url><loc>https://a/x</loc></url><url><loc> https://a/y </loc></url></urlset>")).toEqual(["https://a/x", "https://a/y"]);
  });
  it("normalize", () => {
    const r = parseMySchemePage(fx("myscheme-synthetic.html"), "https://www.myscheme.gov.in/schemes/example-kss")!;
    const n = normalize(r);
    expect(n.slug).toBe("gj-example-kss");
    expect(n.category).toBe("agriculture");
    expect(n.benefitValueInr).toBe(12000);
    expect(n.status).toBe("unknown");
    expect(slugify("PM Kisan (Samman) Nidhi!")).toBe("pm-kisan-nidhi");
    expect(estimateBenefitInr("up to Rs. 2.5 lakh")).toBe(250000);
  });
  it("buildSeed validates the LLM rule and keeps text official", async () => {
    const r = parseMySchemePage(fx("myscheme-synthetic.html"), "https://www.myscheme.gov.in/schemes/example-kss")!;
    const { seed } = await buildSeed(
      r,
      {
        extract: async () => ({
          rule: { all: [{ field: "occupation", op: "eq", value: "farmer" }, { field: "state", op: "eq", value: "GJ" }] },
          unmapped: [],
          confidence: "high",
          model: "test",
        }),
      },
      [],
    );
    expect(seed.rule).toBeDefined();
    await expect(
      buildSeed(r, { extract: async () => ({ rule: { field: "aadhaar" } as never, unmapped: [], confidence: "low", model: "t" }) }, []),
    ).rejects.toThrow();
  });
});
