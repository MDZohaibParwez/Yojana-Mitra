import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryRepository, MemorySessionStore, seedToRecord, type OutMessage } from "@ym/core";
import { loadSeedFiles } from "@ym/db";
import { createWhatsAppApp, verifySignature } from "../src/app.js";
import { splitText, toPayloads, type WhatsAppSender } from "../src/graph.js";
import type { SpeechToText } from "../src/stt.js";

const SECRET = "app-secret";
const repo = new InMemoryRepository(loadSeedFiles().map((s) => seedToRecord(s, { lastVerifiedAt: "2026-11-01" })));

function setup(stt: SpeechToText | null = null) {
  const sent: Array<{ to: string; msg: OutMessage }> = [];
  const sender: WhatsAppSender = {
    send: async (to, msg) => void sent.push({ to, msg }),
    markRead: async () => {},
    downloadMedia: async () => ({ data: new ArrayBuffer(8), mime: "audio/ogg" }),
  };
  const store = new MemorySessionStore();
  const app = createWhatsAppApp({ repo: () => repo, store: () => store, sender: () => sender, stt: () => stt, appSecret: SECRET, verifyToken: "vt", hmacKey: "k".repeat(32) });
  return { app, sent, store };
}

function webhook(app: ReturnType<typeof setup>["app"], messages: unknown[], secret = SECRET) {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { messages } }] }] });
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return app.request("/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body });
}

let n = 0;
const text = (body: string, from = "919800000001") => ({ from, id: `wamid.${++n}`, type: "text", text: { body } });

describe("WhatsApp webhook", () => {
  it("verification handshake", async () => {
    const { app } = setup();
    expect(await (await app.request("/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=123")).text()).toBe("123");
    expect((await app.request("/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")).status).toBe(403);
  });
  it("rejects bad signatures", async () => {
    const { app, sent } = setup();
    expect((await webhook(app, [text("hi")], "wrong-secret")).status).toBe(401);
    expect(sent).toHaveLength(0);
    expect(verifySignature("x", undefined, SECRET)).toBe(false);
  });
  it("text conversation: greeting -> question -> buttons", async () => {
    const { app, sent } = setup();
    expect((await webhook(app, [text("namaste")])).status).toBe(200);
    expect(sent[0]!.msg.text).toMatch(/योजना मित्र/);
    await webhook(app, [text("Gujarat")]);
    await webhook(app, [text("42")]);
    const last = sent.at(-1)!.msg;
    expect(last.buttons?.map((b) => b.id)).toContain("a:gender:female");
  });
  it("interactive replies drive the flow and results include official links", async () => {
    const { app, sent } = setup();
    await webhook(app, [text("I am a 30 year old male farmer from Gujarat, village, 1 acre land, income 1 lakh, no income tax", "919800000002")]);
    for (let i = 0; i < 20; i++) {
      const last = sent.at(-1)!.msg;
      const id = last.buttons?.find((b) => b.id.startsWith("a:"))?.id ?? last.list?.rows[0]?.id;
      if (!id && /cmd:new/.test(JSON.stringify(last))) break;
      await webhook(app, [
        id
          ? { from: "919800000002", id: `wamid.i${i}`, type: "interactive", interactive: { type: "button_reply", button_reply: { id, title: "x" } } }
          : { from: "919800000002", id: `wamid.i${i}`, type: "text", text: { body: "50" } },
      ]);
    }
    const all = sent.map((s) => s.msg.text).join("\n");
    expect(all).toMatch(/scheme\(s\) you appear eligible for/);
    expect(all).toMatch(/Apply \(official\): https:\/\/\S+\.(gov|nic)\.in/);
    expect(all).toMatch(/Last verified: 2026-11-01/);
  });
  it("stores no phone number in session keys or state", async () => {
    const { app, store } = setup();
    await webhook(app, [text("namaste", "919811112222")]);
    const keys = [...(store as unknown as { m: Map<string, unknown> }).m.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain("9811112222");
    expect(JSON.stringify([...(store as unknown as { m: Map<string, unknown> }).m.values()])).not.toContain("9811112222");
  });
  it("voice notes are transcribed and handled like text", async () => {
    const stt: SpeechToText = { transcribe: async () => ({ text: "मैं बिहार का 45 साल का किसान हूँ" }) };
    const { app, sent } = setup(stt);
    await webhook(app, [{ from: "919800000003", id: "wamid.v1", type: "audio", audio: { id: "media1", voice: true } }]);
    expect(sent.at(-1)!.msg.buttons?.[0]?.id).toMatch(/^a:gender:/);
  });
  it("voice without STT configured gives a friendly message", async () => {
    const { app, sent } = setup(null);
    await webhook(app, [{ from: "919800000004", id: "wamid.v2", type: "audio", audio: { id: "m" } }]);
    expect(sent[0]!.msg.text).toMatch(/वॉइस|voice/i);
  });
  it("duplicate deliveries are ignored", async () => {
    const { app, sent } = setup();
    const msg = text("namaste", "919800000005");
    await webhook(app, [msg]);
    const count = sent.length;
    await webhook(app, [msg]);
    expect(sent.length).toBe(count);
  });
  it("payloads respect WhatsApp limits", () => {
    const p = toPayloads("1", { text: "x".repeat(3000), buttons: [{ id: "a", title: "A very very long button title" }] });
    expect(p.length).toBe(3);
    const inter = p.at(-1) as { interactive: { action: { buttons: Array<{ reply: { title: string } }> } } };
    expect(inter.interactive.action.buttons[0]!.reply.title.length).toBeLessThanOrEqual(20);
    expect(splitText("a\n\n".repeat(3000), 4096).every((s) => s.length <= 4096)).toBe(true);
  });
});
