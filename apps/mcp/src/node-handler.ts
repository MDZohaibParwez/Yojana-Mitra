import { getRequestListener } from "@hono/node-server";
import { getRepository } from "@ym/db";
import { createMcpApp } from "./app.js";

/** Node (req, res) listener for Vercel's Build Output API function (see scripts/vercel-build.mjs). */
const app = createMcpApp({ repo: () => getRepository() });
export default getRequestListener(app.fetch);
