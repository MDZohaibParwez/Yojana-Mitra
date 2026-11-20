import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import {
  getLocale,
  handleMessage,
  newState,
  RateLimiter,
  sessionKey,
  type Inbound,
  type SchemeRepository,
  type SessionStore,
} from "@ym/core";
import type { WhatsAppSender } from "./graph.js";
import type { SpeechToText } from "./stt.js";

export interface WhatsAppAppDeps {
  repo: () => SchemeRepository;
  store: () => SessionStore;
  sender: () => WhatsAppSender;
  stt: () => SpeechToText | null;
  appSecret: string;
  verifyToken: string;
  hmacKey: string;
  ttlSeconds?: number;
  messagesPerMinute?: number;
}

/** Meta signs the raw body with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export function verifySignature(raw: string, header: string | undefined, secret: string): boolean {
  if (!header?.startsWith("sha256=") || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

interface WaMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  button?: { payload?: string; text?: string };
  audio?: { id: string; mime_type?: string; voice?: boolean };
}

interface WebhookBody {
  object?: string;
  entry?: Array<{ changes?: Array<{ field?: string; value?: { messages?: WaMessage[] } }> }>;
}

export function createWhatsAppApp(deps: WhatsAppAppDeps) {
  const app = new Hono();
  const ttl = deps.ttlSeconds ?? Number(process.env.SESSION_TTL_MINUTES ?? 60) * 60;
  const limiter = new RateLimiter(deps.messagesPerMinute ?? 20);

  app.use("*", secureHeaders());
  app.use("/webhook", bodyLimit({ maxSize: 256 * 1024 }));
  app.get("/health", (c) => c.json({ ok: true }));

  // Webhook verification handshake.
  app.get("/webhook", (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");
    if (mode === "subscribe" && token && deps.verifyToken && token === deps.verifyToken && challenge) return c.text(challenge);
    return c.text("forbidden", 403);
  });

  app.post("/webhook", async (c) => {
    const raw = await c.req.text();
    if (!verifySignature(raw, c.req.header("x-hub-signature-256"), deps.appSecret)) return c.text("invalid signature", 401);
    let body: WebhookBody;
    try {
      body = JSON.parse(raw) as WebhookBody;
    } catch {
      return c.text("bad request", 400);
    }
    const messages = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((ch) => ch.value?.messages ?? []));
    // Process sequentially; always 200 so Meta does not retry already-handled messages.
    for (const m of messages) {
      try {
        await processMessage(m);
      } catch (e) {
        console.error("[whatsapp] processing failed:", (e as Error).message.replace(/\d{6,}/g, "[n]"));
      }
    }
    return c.json({ ok: true });
  });

  async function processMessage(m: WaMessage) {
    const key = sessionKey("wa", m.from, deps.hmacKey);
    const sender = deps.sender();
    const store = deps.store();
    const state = (await store.get(key)) ?? newState("hi");
    const L = getLocale(state.lang);

    if (!limiter.check(key).allowed) {
      await sender.send(m.from, { text: L.rateLimited });
      return;
    }
    void sender.markRead(m.id);

    const inbound: Inbound = { messageId: m.id };
    if (m.type === "text") inbound.text = m.text?.body ?? "";
    else if (m.type === "interactive") inbound.replyId = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;
    else if (m.type === "button") inbound.text = m.button?.text ?? m.button?.payload ?? "";
    else if (m.type === "audio" && m.audio?.id) {
      const stt = deps.stt();
      if (!stt) {
        await sender.send(m.from, { text: L.voiceNotUnderstood });
        return;
      }
      try {
        const media = await sender.downloadMedia(m.audio.id);
        const { text } = await stt.transcribe(media.data, media.mime || m.audio.mime_type || "audio/ogg", state.lang);
        if (!text.trim()) throw new Error("empty transcript");
        inbound.text = text;
      } catch {
        await sender.send(m.from, { text: L.voiceNotUnderstood });
        return;
      }
    } else {
      await sender.send(m.from, { text: L.notUnderstood });
      return;
    }

    const res = await handleMessage(state, inbound, { repo: deps.repo(), channel: "whatsapp" });
    await store.set(key, res.state, ttl);
    for (const out of res.messages) await sender.send(m.from, out);
  }

  return app;
}
