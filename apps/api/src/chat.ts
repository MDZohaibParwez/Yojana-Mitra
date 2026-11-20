import { Hono } from "hono";
import { z } from "zod";
import { handleMessage, parseConversationState, type SchemeRepository } from "@ym/core";

/**
 * Stateless chat endpoint for third-party clients: the caller keeps `state`
 * and sends it back each turn; the server validates it and stores nothing.
 */
export function chatRoutes(repo: () => SchemeRepository) {
  const app = new Hono();
  const Body = z.object({ state: z.unknown().optional(), text: z.string().max(1000).optional(), replyId: z.string().max(200).optional() }).strict();
  app.post("/", async (c) => {
    const parsed = Body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: { code: "invalid_input", message: "Expected { state?, text?, replyId? }" } }, 400);
    const { state, text, replyId } = parsed.data;
    return c.json(await handleMessage(parseConversationState(state), { text, replyId }, { repo: repo(), channel: "api" }));
  });
  return app;
}
