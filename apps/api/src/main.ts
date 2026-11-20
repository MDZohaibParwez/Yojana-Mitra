import { getRepository } from "@ym/db";
import { createApp } from "./app.js";

/** Production wiring shared by the Node server and the Vercel function. */
export async function buildApp() {
  const [{ adminRoutes }, { chatRoutes }] = await Promise.all([import("./admin.js"), import("./chat.js")]);
  return createApp({ repo: () => getRepository(), admin: adminRoutes(), chat: chatRoutes(() => getRepository()) });
}
