import { serve } from "@hono/node-server";
import { buildApp } from "./main.js";

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: (await buildApp()).fetch, port }, () => console.log(`Yojana Mitra API on http://localhost:${port}`));
