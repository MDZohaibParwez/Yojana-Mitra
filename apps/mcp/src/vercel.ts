import { handle } from "@hono/node-server/vercel";
import { getRepository } from "@ym/db";
import { createMcpApp } from "./app.js";

export const config = { runtime: "nodejs", maxDuration: 30 };
export default handle(createMcpApp({ repo: () => getRepository() }));
