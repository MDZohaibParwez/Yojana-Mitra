/**
 * pnpm review                       interactive review of every pending rule
 * pnpm review list                  list pending rules / schemes / reports / link issues
 * pnpm review show <slug>           show scheme, rule versions, source text
 * pnpm review approve <slug> [--reviewer NAME] [--notes TEXT]
 * pnpm review reject  <slug> --notes TEXT [--reviewer NAME]
 *
 * Approving a scheme approves its latest pending rule, its content and pending
 * translations, and stamps last_verified_at. This is the stand-in for the
 * future admin panel, which will call the same functions via the Admin API.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseRule, ruleFields } from "@ym/core";
import { approveRule, approveScheme, closeDb, getDb, getSchemeAdmin, listLinkIssues, listPendingRules, rejectRule, rejectScheme, reviewQueueCounts } from "@ym/db";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const reviewer = arg("reviewer") ?? process.env.REVIEWER ?? process.env.USER ?? "cli-reviewer";

function printRule(rule: unknown) {
  console.log(JSON.stringify(rule, null, 2));
  try {
    console.log(`  fields: ${[...ruleFields(parseRule(rule))].join(", ")}`);
  } catch (e) {
    console.log(`  INVALID RULE: ${(e as Error).message}`);
  }
}

async function show(slug: string) {
  const { db } = getDb();
  const d = await getSchemeAdmin(db, slug);
  if (!d) throw new Error(`no scheme ${slug}`);
  const s = d.scheme;
  console.log(`\n${s.slug} — ${s.name.en}\n  ${s.level}${s.stateCode ? ` (${s.stateCode})` : ""} | ${s.ministry}`);
  console.log(`  review: ${s.reviewStatus} | links: ${s.linkStatus} | last verified: ${s.lastVerifiedAt?.toISOString() ?? "never"}`);
  console.log(`  source: ${s.sourceUrl}\n  apply:  ${s.officialApplyUrl}`);
  console.log(`  benefits: ${s.benefits}`);
  for (const r of d.rules.slice(0, 3)) {
    console.log(`\n  rule v${r.version} [${r.reviewStatus}] by ${r.generatedBy}${r.model ? ` (${r.model})` : ""}`);
    if (r.sourceText) console.log(`  official text:\n${r.sourceText.split("\n").map((l) => "    | " + l).join("\n")}`);
    printRule(r.rule);
  }
  console.log(`  translations: ${d.translations.map((t) => `${t.lang}:${t.reviewStatus}`).join(", ") || "none"}`);
  return d;
}

async function approve(slug: string, notes?: string) {
  const { db } = getDb();
  const d = await getSchemeAdmin(db, slug);
  if (!d) throw new Error(`no scheme ${slug}`);
  const pending = d.rules.find((r) => r.reviewStatus === "pending");
  const approvedExists = d.rules.some((r) => r.reviewStatus === "approved");
  if (!pending && !approvedExists) throw new Error(`${slug} has no rule to approve`);
  if (pending) await approveRule(db, pending.id, { reviewer, notes });
  await approveScheme(db, d.scheme.id, { reviewer, notes });
  console.log(`approved ${slug}${pending ? ` (rule v${pending.version})` : ""} by ${reviewer}`);
}

async function reject(slug: string, notes?: string) {
  if (!notes) throw new Error("--notes is required when rejecting");
  const { db } = getDb();
  const d = await getSchemeAdmin(db, slug);
  if (!d) throw new Error(`no scheme ${slug}`);
  const pending = d.rules.find((r) => r.reviewStatus === "pending");
  if (pending) await rejectRule(db, pending.id, { reviewer, notes });
  else await rejectScheme(db, d.scheme.id, { reviewer, notes });
  console.log(`rejected ${slug}`);
}

async function list() {
  const { db } = getDb();
  console.log(await reviewQueueCounts(db));
  for (const r of await listPendingRules(db, 200)) console.log(`  rule  ${r.slug.padEnd(40)} v${r.version} ${r.generatedBy}`);
  for (const s of await listLinkIssues(db, 200)) console.log(`  link  ${s.slug.padEnd(40)} ${s.linkStatus}`);
}

async function interactive() {
  const { db } = getDb();
  const rl = createInterface({ input: stdin, output: stdout });
  const queue = await listPendingRules(db, 200);
  console.log(`${queue.length} pending rule(s). Reviewer: ${reviewer}`);
  for (const item of queue) {
    await show(item.slug);
    const a = (await rl.question("\n[a]pprove  [r]eject  [s]kip  [q]uit > ")).trim().toLowerCase();
    if (a === "q") break;
    if (a === "a") await approve(item.slug, (await rl.question("notes (optional): ")) || undefined);
    if (a === "r") await reject(item.slug, (await rl.question("reason (required): ")) || "rejected in review");
  }
  rl.close();
}

const [cmd, slug] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
const run = async () => {
  if (!cmd) return interactive();
  if (cmd === "list") return list();
  if (cmd === "show" && slug) return void (await show(slug));
  if (cmd === "approve" && slug) return approve(slug, arg("notes"));
  if (cmd === "reject" && slug) return reject(slug, arg("notes"));
  throw new Error("usage: pnpm review [list | show <slug> | approve <slug> | reject <slug> --notes TEXT]");
};
run()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(closeDb);
