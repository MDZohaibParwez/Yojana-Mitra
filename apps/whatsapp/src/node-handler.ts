import { getRequestListener } from "@hono/node-server";
import { buildWhatsAppApp } from "./wiring.js";

/** Node (req, res) listener for Vercel's Build Output API function (see scripts/vercel-build.mjs). */
const app = buildWhatsAppApp();
export default getRequestListener(app.fetch);
