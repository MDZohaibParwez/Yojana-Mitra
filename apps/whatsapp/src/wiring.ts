import { MemorySessionStore, type SessionStore } from "@ym/core";
import { getDb, getRepository, PgSessionStore } from "@ym/db";
import { createWhatsAppApp } from "./app.js";
import { GraphWhatsApp } from "./graph.js";
import { sttFromEnv } from "./stt.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let store: SessionStore | null = null;
export function buildWhatsAppApp() {
  const sender = new GraphWhatsApp(required("WHATSAPP_TOKEN"), required("WHATSAPP_PHONE_NUMBER_ID"));
  const stt = sttFromEnv();
  return createWhatsAppApp({
    repo: () => getRepository(),
    store: () => (store ??= process.env.DATABASE_URL ? new PgSessionStore(getDb().db, "whatsapp") : new MemorySessionStore()),
    sender: () => sender,
    stt: () => stt,
    appSecret: required("WHATSAPP_APP_SECRET"),
    verifyToken: required("WHATSAPP_VERIFY_TOKEN"),
    hmacKey: required("SESSION_HMAC_KEY"),
  });
}
