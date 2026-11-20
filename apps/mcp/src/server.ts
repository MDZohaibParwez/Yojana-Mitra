import { serve } from "@hono/node-server";
import { getRepository } from "@ym/db";
import { createMcpApp } from "./app.js";

const port = Number(process.env.PORT ?? 3333);
serve({ fetch: createMcpApp({ repo: () => getRepository() }).fetch, port }, () => console.log(`Yojana Mitra MCP on http://localhost:${port}/mcp`));
