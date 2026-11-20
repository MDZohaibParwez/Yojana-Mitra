import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "./client.js";

function migrationsFolder(): string {
  if (process.env.YM_MIGRATIONS_DIR) return process.env.YM_MIGRATIONS_DIR;
  const here = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
  if (existsSync(here)) return here;
  return join(process.cwd(), "packages/db/migrations");
}

export async function runMigrations() {
  const { db } = getDb();
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
