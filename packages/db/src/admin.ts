import { and, asc, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "./client.js";
import { eligibilityRules, reports, schemes, schemeTranslations, usageEvents, verificationEvents } from "./schema.js";

/* Queries shared by the review CLI and the Admin API. */

export interface SchemeListQuery {
  q?: string;
  level?: "central" | "state";
  state?: string;
  reviewStatus?: "pending" | "approved" | "rejected";
  linkStatus?: "unchecked" | "ok" | "changed" | "broken";
  category?: string;
  limit?: number;
  offset?: number;
}

export async function listSchemesAdmin(db: Db, q: SchemeListQuery = {}) {
  const where: SQL[] = [];
  if (q.q) {
    const p = `%${q.q.replace(/[%_]/g, "")}%`;
    where.push(or(ilike(schemes.slug, p), sql`${schemes.name}::text ilike ${p}`, ilike(schemes.ministry, p))!);
  }
  if (q.level) where.push(eq(schemes.level, q.level));
  if (q.state) where.push(eq(schemes.stateCode, q.state));
  if (q.reviewStatus) where.push(eq(schemes.reviewStatus, q.reviewStatus));
  if (q.linkStatus) where.push(eq(schemes.linkStatus, q.linkStatus));
  if (q.category) where.push(eq(schemes.category, q.category));
  const cond = where.length ? and(...where) : undefined;
  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(schemes)
      .where(cond)
      .orderBy(asc(schemes.slug))
      .limit(Math.min(q.limit ?? 50, 200))
      .offset(q.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(schemes).where(cond) as unknown as Promise<[{ total: number }]>,
  ]);
  return { items, total };
}

export async function getSchemeAdmin(db: Db, idOrSlug: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const s = await db.query.schemes.findFirst({ where: isUuid ? eq(schemes.id, idOrSlug) : eq(schemes.slug, idOrSlug) });
  if (!s) return null;
  const [rules, translations, events] = await Promise.all([
    db.select().from(eligibilityRules).where(eq(eligibilityRules.schemeId, s.id)).orderBy(desc(eligibilityRules.version)),
    db.select().from(schemeTranslations).where(eq(schemeTranslations.schemeId, s.id)),
    db.select().from(verificationEvents).where(eq(verificationEvents.schemeId, s.id)).orderBy(desc(verificationEvents.createdAt)).limit(20),
  ]);
  return { scheme: s, rules, translations, events };
}

export async function listPendingRules(db: Db, limit = 50, offset = 0) {
  return db
    .select({
      ruleId: eligibilityRules.id,
      version: eligibilityRules.version,
      rule: eligibilityRules.rule,
      sourceText: eligibilityRules.sourceText,
      generatedBy: eligibilityRules.generatedBy,
      model: eligibilityRules.model,
      createdAt: eligibilityRules.createdAt,
      schemeId: schemes.id,
      slug: schemes.slug,
      name: schemes.name,
      sourceUrl: schemes.sourceUrl,
      schemeReviewStatus: schemes.reviewStatus,
    })
    .from(eligibilityRules)
    .innerJoin(schemes, eq(schemes.id, eligibilityRules.schemeId))
    .where(eq(eligibilityRules.reviewStatus, "pending"))
    .orderBy(asc(eligibilityRules.createdAt))
    .limit(Math.min(limit, 200))
    .offset(offset);
}

export async function listReports(db: Db, status?: "open" | "in_review" | "resolved" | "rejected", limit = 50, offset = 0) {
  return db
    .select({ report: reports, slug: schemes.slug, name: schemes.name })
    .from(reports)
    .innerJoin(schemes, eq(schemes.id, reports.schemeId))
    .where(status ? eq(reports.status, status) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(Math.min(limit, 200))
    .offset(offset);
}

export async function updateReport(db: Db, id: string, status: "open" | "in_review" | "resolved" | "rejected", resolutionNote?: string) {
  const [row] = await db
    .update(reports)
    .set({ status, resolutionNote: resolutionNote ?? null, updatedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  return row ?? null;
}

export async function listLinkIssues(db: Db, limit = 50, offset = 0) {
  return db
    .select()
    .from(schemes)
    .where(inArray(schemes.linkStatus, ["broken", "changed"]))
    .orderBy(desc(schemes.linkCheckedAt))
    .limit(Math.min(limit, 200))
    .offset(offset);
}

export async function reviewQueueCounts(db: Db) {
  const [r] = await db.execute<{ pending_rules: number; pending_schemes: number; open_reports: number; link_issues: number }>(sql`
    select
      (select count(*)::int from eligibility_rules where review_status = 'pending') as pending_rules,
      (select count(*)::int from schemes where review_status = 'pending') as pending_schemes,
      (select count(*)::int from reports where status in ('open','in_review')) as open_reports,
      (select count(*)::int from schemes where link_status in ('broken','changed')) as link_issues`);
  return r!;
}

/** Aggregates over anonymous usage counters only. */
export async function usageStats(db: Db, opts: { days?: number } = {}) {
  const since = new Date(Date.now() - (opts.days ?? 28) * 86_400_000);
  const [weekly, byTool, topStates, topLangs] = await Promise.all([
    db.execute<{ week: string; channel: string; events: number }>(sql`
      select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, channel, count(*)::int as events
      from usage_events where created_at >= ${since.toISOString()} group by 1, 2 order by 1, 2`),
    db
      .select({ tool: usageEvents.tool, events: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, since))
      .groupBy(usageEvents.tool)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ state: usageEvents.stateCode, events: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(and(gte(usageEvents.createdAt, since), sql`${usageEvents.stateCode} is not null`))
      .groupBy(usageEvents.stateCode)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
    db
      .select({ lang: usageEvents.lang, events: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(and(gte(usageEvents.createdAt, since), sql`${usageEvents.lang} is not null`))
      .groupBy(usageEvents.lang)
      .orderBy(desc(sql`count(*)`)),
  ]);
  const eligibilityChecks = byTool.filter((t) => t.tool === "check_eligibility" || t.tool === "find_schemes").reduce((a, b) => a + b.events, 0);
  return { since: since.toISOString(), weeklyByChannel: [...weekly], byTool, eligibilityChecks, topStates, topLangs };
}

/** Top schemes by anonymous daily counters (views + eligibility checks + appearances in results). */
export async function topSchemes(db: Db, limit = 10) {
  return db.execute<{ slug: string; views: number }>(sql`
    select s.slug, count(*)::int as views
    from scheme_views v join schemes s on s.id = v.scheme_id
    where v.day >= now() - interval '28 days'
    group by s.slug order by views desc limit ${limit}`);
}
