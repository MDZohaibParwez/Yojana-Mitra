import { serve } from "@hono/node-server";
import { buildWhatsAppApp } from "./wiring.js";

const port = Number(process.env.PORT ?? 4100);
serve({ fetch: buildWhatsAppApp().fetch, port }, () => console.log(`Yojana Mitra WhatsApp webhook on http://localhost:${port}/webhook`));
