import { describe, expect, it } from "vitest";
import { InMemoryRepository, seedToRecord, SeedSchemeSchema } from "@ym/core";
import { loadSeedFiles } from "@ym/db";
import { createApp } from "../src/app.js";

const repo = new InMemoryRepository(loadSeedFiles().map((s) => seedToRecord(SeedSchemeSchema.parse(s), { lastVerifiedAt: "2026-11-01" })));
const app = createApp({ repo: () => repo, rateLimitPerMinute: 1000, corsOrigins: ["https://yojanamitra.in"] });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("public API", () => {
  it("health + meta", async () => {
    expect((await app.request("/v1/health")).status).toBe(200);
    const meta = await (await app.request("/v1/meta")).json();
    expect(meta.states).toHaveLength(36);
    expect(meta.tools).toHaveLength(7);
  });
  it("secure headers on every response", async () => {
    const res = await app.request("/v1/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age/);
    expect(res.headers.get("content-security-policy")).toMatch(/default-src 'none'/);
    expect(res.headers.get("x-frame-options")).toBeTruthy();
  });
  it("CORS restricted to configured origins", async () => {
    const ok = await app.request("/v1/health", { headers: { origin: "https://yojanamitra.in" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://yojanamitra.in");
    const bad = await app.request("/v1/health", { headers: { origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("all 7 tools via /v1/tools/:name", async () => {
    const profile = { age: 30, occupation: "farmer", landHoldingHectares: 1, isIncomeTaxPayer: false };
    const calls: Array<[string, unknown]> = [
      ["find_schemes", { profile }],
      ["get_scheme", { idOrSlug: "pm-kisan" }],
      ["check_eligibility", { schemeId: "pm-kisan", profile }],
      ["compare_schemes", { ids: ["pm-kisan", "pm-kmy"] }],
      ["document_checklist", { schemeIds: ["pm-kisan"] }],
      ["upcoming_deadlines", {}],
      ["report_issue", { schemeId: "pm-kisan", message: "Benefit amount looks outdated" }],
    ];
    for (const [name, input] of calls) expect((await post(`/v1/tools/${name}`, input)).status, name).toBe(200);
    expect((await post("/v1/tools/nope", {})).status).toBe(404);
  });
  it("REST aliases", async () => {
    expect((await (await app.request("/v1/schemes/pm-kisan?lang=hi")).json()).contentLang).toBe("hi");
    expect((await post("/v1/schemes/pm-kisan/eligibility", { profile: { occupation: "student" } })).status).toBe(200);
    expect((await post("/v1/schemes/pm-kisan/reports", { message: "Wrong link on page" })).status).toBe(201);
    expect((await app.request("/v1/deadlines?days=30&state=GJ")).status).toBe(200);
  });
  it("maps errors to status codes without leaking internals", async () => {
    expect((await app.request("/v1/schemes/not-a-scheme")).status).toBe(404);
    expect((await post("/v1/schemes/search", { profile: { age: "x" } })).status).toBe(400);
    expect((await post("/v1/schemes/search", { profile: { district: "PAN ABCPE1234F" } })).status).toBe(422);
    const bad = await app.request("/v1/schemes/search", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
    expect(bad.status).toBe(400);
  });
  it("rejects oversized bodies", async () => {
    expect((await post("/v1/schemes/search", { profile: {}, query: "x".repeat(70_000) })).status).toBe(413);
  });
  it("rate limits per anonymous client", async () => {
    const small = createApp({ repo: () => repo, rateLimitPerMinute: 2 });
    const h = { headers: { "x-forwarded-for": "10.0.0.9" } };
    expect((await small.request("/v1/health", h)).status).toBe(200);
    expect((await small.request("/v1/health", h)).status).toBe(200);
    expect((await small.request("/v1/health", h)).status).toBe(429);
    expect((await small.request("/v1/health", { headers: { "x-forwarded-for": "10.0.0.10" } })).status).toBe(200);
  });
});

describe("chat endpoint", () => {
  it("is stateless and validates state", async () => {
    const { chatRoutes } = await import("../src/chat.js");
    const app2 = createApp({ repo: () => repo, chat: chatRoutes(() => repo), rateLimitPerMinute: 1000 });
    const r1 = await (await app2.request("/v1/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "I am a 30 year old farmer from Bihar" }) })).json();
    expect(r1.state.profile.state).toBe("BR");
    const r2 = await (await app2.request("/v1/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { ...r1.state, profile: { aadhaar: "x" } }, text: "hello" }) })).json();
    expect(r2.state.profile).toEqual({});
  });
});
