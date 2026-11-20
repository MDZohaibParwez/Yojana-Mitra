import { handle } from "@hono/node-server/vercel";
import { buildApp } from "./main.js";

export const config = { runtime: "nodejs", maxDuration: 30 };
export default handle(await buildApp());
