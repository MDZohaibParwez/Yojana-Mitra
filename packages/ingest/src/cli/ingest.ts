/** pnpm ingest <sourceId> [--limit N] [--langs hi,gu] [--dry-run] — every result lands as PENDING review. */
import { isLang, type Lang } from "@ym/core";
import { closeDb, getDb } from "@ym/db";
import { ingestSource } from "../pipeline.js";
import { SOURCES } from "../sources/registry.js";

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i > -1 ? args[i + 1] : undefined;
};
const sourceId = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

if (!sourceId) {
  console.log("usage: pnpm ingest <sourceId> [--limit N] [--langs hi,gu] [--dry-run]\nsources:");
  for (const s of SOURCES) console.log(`  ${s.id.padEnd(12)} ${s.termsReviewed ? "enabled " : "DISABLED"} ${s.name}`);
  process.exit(0);
}
const langs = (opt("langs") ?? "hi").split(",").filter(isLang) as Lang[];
const dryRun = args.includes("--dry-run");
ingestSource(dryRun ? null : getDb().db, sourceId, { limit: opt("limit") ? Number(opt("limit")) : undefined, langs, dryRun })
  .then((s) => console.log("done", s))
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(closeDb);
