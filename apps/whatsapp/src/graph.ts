import type { OutMessage } from "@ym/core";

/** Minimal WhatsApp Business Cloud API client. */
export interface WhatsAppSender {
  send(to: string, msg: OutMessage): Promise<void>;
  markRead(messageId: string): Promise<void>;
  downloadMedia(mediaId: string): Promise<{ data: ArrayBuffer; mime: string }>;
}

const MAX_TEXT = 4096;
const MAX_INTERACTIVE_BODY = 1024;

export function splitText(text: string, max = MAX_TEXT): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Convert one OutMessage into Graph API payloads (text chunks first, interactive last). */
export function toPayloads(to: string, msg: OutMessage): Array<Record<string, unknown>> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  const interactive = msg.buttons?.length || msg.list?.rows.length;
  if (!interactive) return splitText(msg.text).map((body) => ({ ...base, type: "text", text: { body, preview_url: false } }));
  const chunks = splitText(msg.text, MAX_INTERACTIVE_BODY);
  const lead = chunks.slice(0, -1).map((body) => ({ ...base, type: "text", text: { body, preview_url: false } }));
  const body = { text: chunks.at(-1) || "…" };
  if (msg.buttons?.length) {
    return [
      ...lead,
      {
        ...base,
        type: "interactive",
        interactive: { type: "button", body, action: { buttons: msg.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) } },
      },
    ];
  }
  return [
    ...lead,
    {
      ...base,
      type: "interactive",
      interactive: {
        type: "list",
        body,
        action: {
          button: msg.list!.button.slice(0, 20),
          sections: [{ title: msg.list!.button.slice(0, 24), rows: msg.list!.rows.slice(0, 10).map((r) => ({ id: r.id.slice(0, 200), title: r.title.slice(0, 24), ...(r.description ? { description: r.description.slice(0, 72) } : {}) })) }],
        },
      },
    },
  ];
}

/** Media download URLs must be Meta-hosted HTTPS, so the access token is never sent to another host. */
export function isMetaMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)(fbsbx\.com|facebook\.com|fbcdn\.net|whatsapp\.net)$/.test(u.hostname);
  } catch {
    return false;
  }
}

export class GraphWhatsApp implements WhatsAppSender {
  private base: string;
  constructor(
    private token: string,
    private phoneNumberId: string,
    version = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0",
  ) {
    this.base = `https://graph.facebook.com/${version}`;
  }

  private async post(body: unknown) {
    const res = await fetch(`${this.base}/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`whatsapp send failed: ${res.status}`); // never log the body (contains phone)
  }

  async send(to: string, msg: OutMessage) {
    for (const p of toPayloads(to, msg)) await this.post(p);
  }

  async markRead(messageId: string) {
    await this.post({ messaging_product: "whatsapp", status: "read", message_id: messageId }).catch(() => {});
  }

  async downloadMedia(mediaId: string) {
    const meta = await fetch(`${this.base}/${encodeURIComponent(mediaId)}`, { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(10_000) });
    if (!meta.ok) throw new Error(`media lookup failed: ${meta.status}`);
    const { url, mime_type, file_size } = (await meta.json()) as { url: string; mime_type: string; file_size?: number };
    if (file_size && file_size > 16 * 1024 * 1024) throw new Error("voice note too large");
    if (!isMetaMediaUrl(url)) throw new Error("unexpected media host"); // never send the token elsewhere
    const file = await fetch(url, { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(20_000) });
    if (!file.ok) throw new Error(`media download failed: ${file.status}`);
    return { data: await file.arrayBuffer(), mime: mime_type };
  }
}
