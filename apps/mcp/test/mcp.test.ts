import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryRepository, seedToRecord } from "@ym/core";
import { loadSeedFiles } from "@ym/db";
import { createMcpApp } from "../src/app.js";

const repo = new InMemoryRepository(
  loadSeedFiles().map((s) => seedToRecord(s.slug === "pmfby" ? { ...s, deadline: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) } : s, { lastVerifiedAt: "2026-11-01" })),
);
const app = createMcpApp({ repo: () => repo, rateLimitPerMinute: 10_000 });
const fetchViaApp = (url: string | URL, init?: RequestInit) => app.request(new Request(url, init));

let client: Client;
beforeAll(async () => {
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://mcp.test/mcp"), { fetch: fetchViaApp as never }));
});
afterAll(() => client.close());

type TextResult = { content: Array<{ type: string; text: string }>; isError?: boolean; structuredContent?: Record<string, unknown> };
async function call(name: string, args: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: args })) as TextResult;
  return { ...r, json: r.isError ? null : JSON.parse(r.content[0]!.text) };
}

describe("MCP server", () => {
  it("advertises instructions and all 7 tools with schemas and annotations", async () => {
    expect(client.getInstructions()).toMatch(/never invent/i);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["check_eligibility", "compare_schemes", "document_checklist", "find_schemes", "get_scheme", "report_issue", "upcoming_deadlines"],
    );
    for (const t of tools) {
      expect(t.description!.length).toBeGreaterThan(60);
      expect(t.inputSchema.type).toBe("object");
      expect(t.annotations?.readOnlyHint).toBe(t.name !== "report_issue");
    }
    const find = tools.find((t) => t.name === "find_schemes")!;
    expect(Object.keys((find.inputSchema.properties as Record<string, unknown>) ?? {})).toContain("profile");
  });

  it("find_schemes: ranked results with citations", async () => {
    const r = await call("find_schemes", { profile: { age: 42, occupation: "farmer", state: "GJ", landHoldingHectares: 1.2, isIncomeTaxPayer: false }, lang: "en" });
    expect(r.json.results[0].eligible).toBe(true);
    for (const x of r.json.results) {
      expect(x.sourceUrl).toMatch(/^https:/);
      expect(x.lastVerifiedAt).toBe("2026-11-01");
    }
    expect(r.structuredContent).toBeDefined();
  });
  it("get_scheme", async () => {
    const r = await call("get_scheme", { idOrSlug: "pm-jay", lang: "hi" });
    expect(r.json.name).toMatch(/आयुष्मान/);
    expect(r.json.officialApplyUrl).toMatch(/^https:/);
    expect(r.json.lastVerifiedAt).toBeDefined();
  });
  it("check_eligibility", async () => {
    const r = await call("check_eligibility", { schemeId: "atal-pension-yojana", profile: { age: 45 } });
    expect(r.json.eligible).toBe(false);
    expect(r.json.failed[0]).toMatch(/45/);
    expect(r.json.sourceUrl).toBeDefined();
  });
  it("compare_schemes", async () => {
    const r = await call("compare_schemes", { ids: ["pmjjby", "pmsby"] });
    expect(r.json.schemes).toHaveLength(2);
  });
  it("document_checklist", async () => {
    const r = await call("document_checklist", { schemeIds: ["pm-kisan", "pmfby"] });
    expect(r.json.documents.length).toBeGreaterThan(2);
    expect(r.json.schemes[0].lastVerifiedAt).toBeDefined();
  });
  it("upcoming_deadlines", async () => {
    const r = await call("upcoming_deadlines", { days: 30 });
    expect(r.json.results.map((x: { slug: string }) => x.slug)).toContain("pmfby");
  });
  it("report_issue", async () => {
    const r = await call("report_issue", { schemeId: "pm-kisan", message: "Helpline number on the page is wrong" });
    expect(r.json.status).toBe("open");
    expect(repo.reports.at(-1)!.channel).toBe("mcp");
  });
  it("returns helpful tool errors instead of protocol errors", async () => {
    const nf = await call("get_scheme", { idOrSlug: "imaginary-yojana" });
    expect(nf.isError).toBe(true);
    expect(nf.content[0]!.text).toMatch(/not_found.*find_schemes/);
    const pii = await call("find_schemes", { profile: { district: "my aadhaar 2341 2341 2346" } });
    expect(pii.isError).toBe(true);
    expect(pii.content[0]!.text).toMatch(/sensitive_data/);
  });
  it("rejects invalid arguments via schema", async () => {
    const r = (await client.callTool({ name: "find_schemes", arguments: { profile: { age: "forty" } } })) as TextResult;
    expect(r.isError).toBe(true);
  });
  it("GET /mcp is 405 in stateless mode; landing page works", async () => {
    expect((await app.request("/mcp")).status).toBe(405);
    expect((await (await app.request("/")).json()).mcp).toBe("/mcp");
  });
});
