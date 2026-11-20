import { handle } from "@hono/node-server/vercel";
import { buildWhatsAppApp } from "./wiring.js";

export const config = { runtime: "nodejs", maxDuration: 60 };
export default handle(buildWhatsAppApp());
