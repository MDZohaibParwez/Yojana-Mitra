/** pnpm --filter @ym/ingest coverage — schemes per State/UT (seed files, plus DB review status when DATABASE_URL is set). */
import { sql } from "drizzle-orm";
import { STATES } from "@ym/core";
import { closeDb, getDb, loadSeedFiles } from "@ym/db";
import { SOURCES } from "../sources/registry.js";

const seeds = loadSeedFiles();
const db = process.env.DATABASE_URL ? getDb().db : null;
const dbCounts = new Map<string, { approved: number; pending: number }>();
if (db) {
  const rows = await db.execute<{ state: string | null; approved: number; pending: number }>(sql`
    select coalesce(state_code, 'CENTRAL') as state,
      count(*) filter (where review_status = 'approved')::int as approved,
      count(*) filter (where review_status = 'pending')::int as pending
    from schemes group by 1`);
  for (const r of rows) dbCounts.set(r.state ?? "CENTRAL", { approved: r.approved, pending: r.pending });
}
const line = (code: string, name: string, seed: number) => {
  const d = dbCounts.get(code);
  const src = SOURCES.find((s) => s.stateCode === code || (code === "CENTRAL" && s.id === "myscheme"));
  return `${code.padEnd(8)} ${name.padEnd(44)} seed:${String(seed).padStart(3)}  ${d ? `db approved:${d.approved} pending:${d.pending}` : ""}  source:${src?.termsReviewed ? "enabled" : "disabled"}`;
};
console.log(line("CENTRAL", "Central schemes", seeds.filter((s) => s.level === "central").length));
let missing = 0;
for (const st of STATES) {
  const n = seeds.filter((s) => s.stateCode === st.code).length;
  if (!n && !dbCounts.get(st.code)?.approved) missing++;
  console.log(line(st.code, st.en, n));
}
console.log(`\n${STATES.length - missing}/${STATES.length} States/UTs have at least one scheme. Remaining coverage comes from myScheme ingestion once enabled.`);
await closeDb();
