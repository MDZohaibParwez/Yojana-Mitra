import Anthropic from "@anthropic-ai/sdk";

export const INGEST_MODEL = process.env.INGEST_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}
