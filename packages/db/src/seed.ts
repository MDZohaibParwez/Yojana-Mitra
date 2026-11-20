import { eq } from "drizzle-orm";
import { closeDb, getDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { eligibilityRules, sources } from "./schema.js";
import { loadSeedFiles } from "./seedfiles.js";
import { approveRule, approveScheme, upsertScheme } from "./writes.js";

/**
 * pnpm db:seed               -> load curated data as PENDING (production-safe)
 * pnpm db:seed --dev-approve -> also auto-approve everything (local development only)
 */
async function main() {
  const devApprove = process.argv.includes("--dev-approve");
  if (devApprove && process.env.NODE_ENV === "production") {
    throw new Error("--dev-approve is not allowed when NODE_ENV=production. Use `pnpm review`.");
  }
  await runMigrations();
  const { db } = getDb();
  await db
    .insert(sources)
    .values({ id: "curated", name: "Curated seed (data/schemes)", baseUrl: "https://github.com/", kind: "curated", enabled: true, rateLimitMs: 0 })
    .onConflictDoNothing();

  const seeds = loadSeedFiles();
  let created = 0;
  let changed = 0;
  for (const s of seeds) {
    const r = await upsertScheme(db, s, { generatedBy: "curated", sourceId: "curated" });
    if (r.created) created++;
    else if (r.changed) changed++;
    if (devApprove) {
      const rules = await db.query.eligibilityRules.findMany({ where: eq(eligibilityRules.schemeId, r.schemeId) });
      for (const rule of rules.filter((x) => x.reviewStatus === "pending")) {
        await approveRule(db, rule.id, { reviewer: "dev-seed", notes: "auto-approved for local development" });
      }
      await approveScheme(db, r.schemeId, { reviewer: "dev-seed" });
    }
  }
  console.log(`seeded ${seeds.length} schemes (${created} new, ${changed} changed)${devApprove ? " — DEV auto-approved" : " — pending review"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
