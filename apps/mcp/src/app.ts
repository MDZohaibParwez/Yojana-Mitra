import { createHash } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { RateLimiter, type SchemeRepository } from "@ym/core";
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from "./mcp.js";

export interface McpAppOptions {
  repo: () => SchemeRepository;
  rateLimitPerMinute?: number;
}

/**
 * Remote MCP server over Streamable HTTP in STATELESS mode: every POST /mcp gets a
 * fresh server + transport, so it scales horizontally on serverless (Vercel) and
 * keeps no user state. JSON responses (no SSE) since all tools are quick.
 */
export function createMcpApp(opts: McpAppOptions) {
  const app = new Hono();
  const limiter = new RateLimiter(opts.rateLimitPerMinute ?? Number(process.env.MCP_RATE_LIMIT_PER_MINUTE ?? 120));

  app.use("*", secureHeaders({ referrerPolicy: "no-referrer", strictTransportSecurity: "max-age=63072000; includeSubDomains; preload" }));
  app.use(
    "/mcp",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["content-type", "accept", "authorization", "mcp-session-id", "mcp-protocol-version", "last-event-id"],
      exposeHeaders: ["mcp-session-id"],
      maxAge: 86400,
    }),
  );
  app.use("/mcp", bodyLimit({ maxSize: 128 * 1024 }));

  app.get("/", (c) =>
    c.json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      mcp: "/mcp",
      transport: "streamable-http",
      description: "Find Indian government schemes you are eligible for. Free service; information help only.",
      privacy: process.env.PRIVACY_POLICY_URL ?? null,
    }),
  );
  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/mcp", async (c) => {
    const ip = c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const key = createHash("sha256").update(`${ip}|${new Date().toISOString().slice(0, 10)}`).digest("hex");
    if (!limiter.check(key).allowed) {
      return c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Rate limit exceeded. Please retry in a minute." }, id: null }, 429);
    }
    const server = createMcpServer(opts.repo);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      // Response body is fully buffered in JSON mode; release resources.
      void transport.close();
      void server.close();
    }
  });

  // Stateless server: no server-initiated streams or sessions to delete.
  const notAllowed = () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)." }, id: null }), {
      status: 405,
      headers: { "content-type": "application/json", allow: "POST" },
    });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);
  return app;
}
