import { LANG_LOCALE, type Lang } from "@ym/core";

/** Speech-to-text for voice notes. Audio is processed in memory and never stored. */
export interface SpeechToText {
  transcribe(audio: ArrayBuffer, mime: string, langHint: Lang): Promise<{ text: string; lang?: string }>;
}

/**
 * Sarvam AI speech-to-text (Indian languages: hi, bn, kn, ml, mr, od, pa, ta, te, gu, en-IN).
 * Endpoint/fields per Sarvam's public docs at time of writing — verify before production use.
 */
export class SarvamSTT implements SpeechToText {
  constructor(
    private apiKey: string,
    private url = process.env.STT_URL || "https://api.sarvam.ai/speech-to-text",
    private model = process.env.STT_MODEL || "saarika:v2.5",
  ) {}
  async transcribe(audio: ArrayBuffer, mime: string, langHint: Lang) {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: mime }), "voice.ogg");
    form.append("model", this.model);
    form.append("language_code", langHint === "hinglish" ? "hi-IN" : "unknown");
    const res = await fetch(this.url, { method: "POST", headers: { "api-subscription-key": this.apiKey }, body: form, signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new Error(`stt failed: ${res.status}`);
    const j = (await res.json()) as { transcript?: string; language_code?: string };
    return { text: j.transcript ?? "", lang: j.language_code };
  }
}

/** Any OpenAI-compatible /audio/transcriptions endpoint (e.g. self-hosted Whisper). */
export class OpenAICompatibleSTT implements SpeechToText {
  constructor(
    private url: string,
    private apiKey?: string,
    private model = process.env.STT_MODEL || "whisper-1",
  ) {}
  async transcribe(audio: ArrayBuffer, mime: string, langHint: Lang) {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: mime }), "voice.ogg");
    form.append("model", this.model);
    if (langHint !== "en") form.append("language", LANG_LOCALE[langHint].slice(0, 2));
    const res = await fetch(this.url, {
      method: "POST",
      headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
      body: form,
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`stt failed: ${res.status}`);
    const j = (await res.json()) as { text?: string };
    return { text: j.text ?? "" };
  }
}

export function sttFromEnv(): SpeechToText | null {
  const key = process.env.STT_API_KEY;
  if (process.env.STT_PROVIDER === "openai-compatible" && process.env.STT_URL) return new OpenAICompatibleSTT(process.env.STT_URL, key);
  if (key) return new SarvamSTT(key);
  return null;
}
