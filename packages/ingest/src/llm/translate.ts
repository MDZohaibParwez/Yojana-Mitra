import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LANG_NAMES, type Lang, type SchemeText } from "@ym/core";
import { anthropic, INGEST_MODEL } from "./client.js";

const TranslationSchema = z.object({
  name: z.string(),
  shortDescription: z.string(),
  benefits: z.string(),
  howToApplySteps: z.array(z.string()),
  documentsRequired: z.array(z.string()),
});

/**
 * Translate scheme content into a target language in simple, everyday words.
 * Scheme names stay in their OFFICIAL form: the model may only use an official
 * name in the target language if the text supplies one; otherwise it keeps the
 * English name. Output is stored as review_status = pending.
 */
export async function translateScheme(text: SchemeText, lang: Lang, officialNames: Partial<Record<Lang, string>> = {}): Promise<SchemeText> {
  const official = officialNames[lang];
  const response = await anthropic().beta.messages.parse({
    model: INGEST_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(TranslationSchema) },
    system:
      `Translate Indian government scheme information into ${LANG_NAMES[lang]} (${lang}) for rural citizens with basic literacy. ` +
      "Use short, simple sentences. Keep numbers, ₹ amounts, URLs, helpline numbers and acronyms (PM-KISAN, BPL, OTP, KYC) unchanged. " +
      "Do not add, remove or soften any condition or benefit. " +
      (official ? `The official ${lang} scheme name is "${official}" — use it exactly.` : "Keep the scheme name exactly as given in English (official form)."),
    messages: [{ role: "user", content: JSON.stringify(text) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error(`translation to ${lang} failed`);
  const out = response.parsed_output;
  return { ...out, name: official ?? text.name };
}
