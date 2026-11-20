"use server";
import { cookies } from "next/headers";
import {
  findSchemes,
  handleMessage,
  isLang,
  parseConversationState,
  reportIssue,
  ToolError,
  type ConversationState,
  type Lang,
  type OutMessage,
} from "@ym/core";
import { getRepository } from "@ym/db";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

async function safe<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, error: e.message, code: e.code };
    console.error("[web] action failed:", (e as Error).name);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function searchAction(profile: unknown, lang: Lang) {
  return safe(() => findSchemes({ repo: getRepository(), channel: "web" }, { profile, lang: isLang(lang) ? lang : "en", limit: 30 }));
}

export async function reportAction(schemeId: string, message: string) {
  return safe(() => reportIssue({ repo: getRepository(), channel: "web" }, { schemeId, message }));
}

/** Chat state lives only in the user's browser memory; the server validates it every turn and stores nothing. */
export async function chatAction(state: unknown, input: { text?: string; replyId?: string }): Promise<Result<{ state: ConversationState; messages: OutMessage[] }>> {
  return safe(async () => {
    const s = parseConversationState(state);
    const text = typeof input.text === "string" ? input.text.slice(0, 1000) : undefined;
    const replyId = typeof input.replyId === "string" ? input.replyId.slice(0, 200) : undefined;
    return handleMessage(s, { text, replyId }, { repo: getRepository(), channel: "web" });
  });
}

export async function setLangAction(lang: string) {
  if (isLang(lang)) (await cookies()).set("lang", lang, { path: "/", maxAge: 31536000, sameSite: "lax", secure: true, httpOnly: false });
}
