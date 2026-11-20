import { lt } from "drizzle-orm";
import type { ConversationState, SessionStore } from "@ym/core";
import type { Db } from "./client.js";
import { chatSessions } from "./schema.js";
import { and, eq, gt } from "drizzle-orm";

/** Postgres-backed ephemeral session state with expiry. Keys are HMACs, never phone numbers. */
export class PgSessionStore implements SessionStore {
  constructor(
    private db: Db,
    private channel: "whatsapp" | "web" = "whatsapp",
  ) {}

  async get(key: string): Promise<ConversationState | null> {
    const row = await this.db.query.chatSessions.findFirst({ where: and(eq(chatSessions.key, key), gt(chatSessions.expiresAt, new Date())) });
    return (row?.state as ConversationState | undefined) ?? null;
  }

  async set(key: string, state: ConversationState, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await this.db
      .insert(chatSessions)
      .values({ key, channel: this.channel, state, expiresAt })
      .onConflictDoUpdate({ target: chatSessions.key, set: { state, expiresAt, updatedAt: new Date() } });
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(chatSessions).where(eq(chatSessions.key, key));
  }
}

/** Delete expired sessions (run daily via cron). */
export async function purgeExpiredSessions(db: Db): Promise<number> {
  const rows = await db.delete(chatSessions).where(lt(chatSessions.expiresAt, new Date())).returning({ key: chatSessions.key });
  return rows.length;
}
