import { closeDb, getDb, runMigrations } from "../src/index.js";

export const TEST_DB = process.env.TEST_DATABASE_URL;

/** Reset the throwaway test database. Refuses to run against anything not named *test*. */
export async function resetTestDb() {
  if (!TEST_DB) throw new Error("TEST_DATABASE_URL not set");
  if (!/test/i.test(new URL(TEST_DB).pathname)) throw new Error("refusing to reset a database whose name does not contain 'test'");
  await closeDb();
  const { sql } = getDb(TEST_DB);
  await sql.unsafe("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
  await runMigrations();
  return getDb(TEST_DB);
}
