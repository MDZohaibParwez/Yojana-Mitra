import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;

let cached: { db: Db; sql: postgres.Sql } | null = null;

/**
 * One pooled connection per process. On serverless (Vercel) use the provider's
 * pooled URL (Neon "-pooler" host / Supabase transaction pooler on :6543).
 */
export function getDb(url = process.env.DATABASE_URL): { db: Db; sql: postgres.Sql } {
  if (cached) return cached;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, {
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idle_timeout: 20,
    prepare: false, // required for transaction-mode poolers
    onnotice: () => {},
  });
  cached = { db: drizzle(sql, { schema }), sql };
  return cached;
}

export async function closeDb() {
  if (cached) {
    await cached.sql.end({ timeout: 5 });
    cached = null;
  }
}
