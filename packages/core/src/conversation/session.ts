import { createHmac } from "node:crypto";
import type { ConversationState } from "./engine.js";

/** Short-lived conversation state only. No long-term personal data. */
export interface SessionStore {
  get(key: string): Promise<ConversationState | null>;
  set(key: string, state: ConversationState, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemorySessionStore implements SessionStore {
  private m = new Map<string, { state: ConversationState; exp: number }>();
  async get(key: string) {
    const e = this.m.get(key);
    if (!e) return null;
    if (e.exp < Date.now()) {
      this.m.delete(key);
      return null;
    }
    return e.state;
  }
  async set(key: string, state: ConversationState, ttlSeconds: number) {
    this.m.set(key, { state, exp: Date.now() + ttlSeconds * 1000 });
  }
  async delete(key: string) {
    this.m.delete(key);
  }
}

/** Anonymous, non-reversible session key from a channel identifier (e.g. WhatsApp wa_id). */
export function sessionKey(channel: string, identifier: string, secret = process.env.SESSION_HMAC_KEY): string {
  if (!secret || secret.length < 32) throw new Error("SESSION_HMAC_KEY must be set (min 32 chars)");
  return `${channel}:` + createHmac("sha256", secret).update(identifier).digest("base64url");
}

import { z } from "zod";
import { LANGS } from "../i18n/lang.js";
import { PROFILE_FIELDS, ProfileSchema } from "../profile.js";
import { newState } from "./engine.js";

const FieldEnum = z.enum(PROFILE_FIELDS as [string, ...string[]]);
export const ConversationStateSchema = z
  .object({
    v: z.literal(1),
    lang: z.enum(LANGS),
    langLocked: z.boolean().optional(),
    profile: ProfileSchema,
    pendingField: FieldEnum.optional(),
    skipped: z.array(FieldEnum).max(30),
    questionsAsked: z.number().int().min(0).max(50),
    resultPage: z.number().int().min(0).max(100),
    seen: z.array(z.string().max(100)).max(20),
  })
  .strict();

/** Validate client-held conversation state (web / API). Invalid state starts a fresh conversation. */
export function parseConversationState(input: unknown, fallbackLang: (typeof LANGS)[number] = "hi"): ConversationState {
  const r = ConversationStateSchema.safeParse(input);
  return r.success ? (r.data as ConversationState) : newState(fallbackLang);
}
