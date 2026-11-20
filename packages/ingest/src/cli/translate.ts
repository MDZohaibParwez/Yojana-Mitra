/**
 * pnpm --filter @ym/ingest translate [--langs gu,mr,ta,te,bn,kn] [--limit N] [--slug pm-kisan]
 * Translates scheme content that has no translation yet in a language, using Claude.
 * Every translation is stored with review_status = 'pending' and translated_by = 'llm';
 * users keep seeing English until a reviewer approves it.
 */
import { and, eq } from "drizzle-orm";
import { isLang, type Lang } from "@ym/core";
import { closeDb, getDb, schema } from "@ym/db";
import { translateScheme } from "../llm/translate.js";

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i > -1 ? args[i + 1] : undefined;
};
const langs = (opt("langs") ?? "gu,mr,ta,te,bn,kn").split(",").filter((l): l is Lang => isLang(l) && l !== "en");
const limit = Number(opt("limit") ?? 1000);
const { db } = getDb();

const rows = await db.select().from(schema.schemes).where(opt("slug") ? eq(schema.schemes.slug, opt("slug")!) : undefined).limit(limit);
let done = 0;
let failed = 0;
for (const s of rows) {
  for (const lang of langs) {
    const exists = await db.query.schemeTranslations.findFirst({ where: and(eq(schema.schemeTranslations.schemeId, s.id), eq(schema.schemeTranslations.lang, lang)) });
    if (exists) continue;
    try {
      const t = await translateScheme(
        { name: s.name.en ?? s.slug, shortDescription: s.shortDescription, benefits: s.benefits, howToApplySteps: s.howToApplySteps, documentsRequired: s.documentsRequired },
        lang,
        s.name as Partial<Record<Lang, string>>,
      );
      await db.insert(schema.schemeTranslations).values({ schemeId: s.id, lang, ...t, translatedBy: "llm", reviewStatus: "pending" });
      done++;
      console.log(`  ${s.slug} -> ${lang} (pending)`);
    } catch (e) {
      failed++;
      console.log(`  fail ${s.slug} -> ${lang}: ${(e as Error).message}`);
    }
  }
}
console.log(`translated ${done}, failed ${failed}`);
await closeDb();
