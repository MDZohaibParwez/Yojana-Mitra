import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SeedSchemeSchema, type SeedScheme } from "@ym/core";

export const DATA_DIR = fileURLToPath(new URL("../../../data/schemes", import.meta.url));

/** Load and validate every curated seed file (central.json + states/*.json). Throws on invalid data. */
export function loadSeedFiles(dir = DATA_DIR): SeedScheme[] {
  const files = [join(dir, "central.json")];
  try {
    for (const f of readdirSync(join(dir, "states")).sort()) if (f.endsWith(".json")) files.push(join(dir, "states", f));
  } catch {
    /* no state files */
  }
  const out: SeedScheme[] = [];
  const slugs = new Set<string>();
  for (const f of files) {
    const raw = JSON.parse(readFileSync(f, "utf8")) as unknown[];
    raw.forEach((item, i) => {
      const r = SeedSchemeSchema.safeParse(item);
      if (!r.success) throw new Error(`${f}[${i}]: ${r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
      if (slugs.has(r.data.slug)) throw new Error(`${f}[${i}]: duplicate slug ${r.data.slug}`);
      slugs.add(r.data.slug);
      out.push(r.data);
    });
  }
  return out;
}
