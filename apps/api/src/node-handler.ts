import { getRequestListener } from "@hono/node-server";
import { buildApp } from "./main.js";

/** Node (req, res) listener for Vercel's Build Output API function (see scripts/vercel-build.mjs). */
const app = await buildApp();
export default getRequestListener(app.fetch);
