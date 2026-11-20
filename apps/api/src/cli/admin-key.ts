/**
 * pnpm --filter @ym/api admin:key <name> [--scopes read,write,review] [--store]
 * Prints a new admin API key ONCE plus its sha256 hash.
 *  - put the hash in ADMIN_API_KEY_HASHES (env), or
 *  - pass --store to save it in the admin_api_keys table (needs DATABASE_URL).
 */
import { randomBytes } from "node:crypto";
import { closeDb, getDb, schema } from "@ym/db";
import { ALL_SCOPES, hashKey, type Scope } from "../admin.js";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--")) ?? "admin-panel";
const si = args.indexOf("--scopes");
const scopes = (si > -1 ? args[si + 1]!.split(",") : ALL_SCOPES).filter((s): s is Scope => (ALL_SCOPES as string[]).includes(s));
const key = `ym_${randomBytes(32).toString("base64url")}`;
const hash = hashKey(key);
console.log(`name:   ${name}\nscopes: ${scopes.join(",")}\nkey:    ${key}   <- shown once, store it in your secret manager\nsha256: ${hash}`);
if (args.includes("--store")) {
  await getDb().db.insert(schema.adminApiKeys).values({ name, keyHash: hash, scopes });
  console.log("stored in admin_api_keys");
  await closeDb();
}
