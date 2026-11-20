import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SeedSchemeSchema, seedToRecord, type SchemeRecord } from "../src/index.js";

const DATA = fileURLToPath(new URL("../../../data/schemes", import.meta.url));

export function loadSeedRecords(): SchemeRecord[] {
  const files = [join(DATA, "central.json")];
  const st = join(DATA, "states");
  if (existsSync(st)) for (const f of readdirSync(st).sort()) if (f.endsWith(".json")) files.push(join(st, f));
  return files.flatMap((f) =>
    (JSON.parse(readFileSync(f, "utf8")) as unknown[]).map((x) =>
      seedToRecord(SeedSchemeSchema.parse(x), { lastVerifiedAt: "2026-11-01" }),
    ),
  );
}

export function bySlug(records: SchemeRecord[]): Record<string, SchemeRecord> {
  return Object.fromEntries(records.map((r) => [r.slug, r]));
}
