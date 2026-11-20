import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { parseRule, type RuleNode, type SeedScheme } from "@ym/core";
import type { Db } from "./client.js";
import { eligibilityRules, schemes, schemeTranslations, verificationEvents } from "./schema.js";

/** JSON with sorted keys — Postgres jsonb does not preserve key order. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export function contentHash(s: SeedScheme): string {
  const { text, rule, officialApplyUrl, sourceUrl, deadline, status } = s;
  return createHash("sha256")
    .update(canonicalJson({ en: text.en, rule, officialApplyUrl, sourceUrl, deadline, status }))
    .digest("hex");
}

export interface UpsertOptions {
  generatedBy: "curated" | "llm" | "human" | "importer";
  sourceId?: string | null;
  sourceText?: string | null;
  model?: string | null;
}

export interface UpsertResult {
  schemeId: string;
  created: boolean;
  changed: boolean;
  ruleVersion: number | null;
}

/**
 * Insert or update a scheme from an importer / seed file.
 * - New or changed content is ALWAYS set to review_status = 'pending'.
 * - A changed rule creates a new pending rule version; the previously approved
 *   version keeps serving users until the new one is reviewed.
 * - Changed scheme content puts the scheme back to pending, hiding it until re-reviewed.
 */
export async function upsertScheme(db: Db, s: SeedScheme, opts: UpsertOptions): Promise<UpsertResult> {
  const hash = contentHash(s);
  const en = s.text.en!;
  const names = Object.fromEntries(Object.entries(s.text).map(([l, t]) => [l, t!.name]));
  const existing = await db.query.schemes.findFirst({ where: eq(schemes.slug, s.slug) });

  const base = {
    slug: s.slug,
    name: names,
    ministry: s.ministry,
    level: s.level,
    stateCode: s.stateCode,
    category: s.category,
    shortDescription: en.shortDescription,
    benefits: en.benefits,
    howToApplySteps: en.howToApplySteps,
    documentsRequired: en.documentsRequired,
    officialApplyUrl: s.officialApplyUrl,
    sourceUrl: s.sourceUrl,
    sourceId: opts.sourceId ?? null,
    status: s.status,
    deadline: s.deadline,
    benefitValueInr: s.benefitValueInr,
    tags: s.tags,
    contentHash: hash,
  };

  let schemeId: string;
  let created = false;
  let changed = false;
  if (!existing) {
    const [row] = await db
      .insert(schemes)
      .values({ ...base, reviewStatus: "pending" })
      .returning({ id: schemes.id });
    schemeId = row!.id;
    created = changed = true;
  } else {
    schemeId = existing.id;
    if (existing.contentHash !== hash) {
      changed = true;
      await db
        .update(schemes)
        .set({ ...base, reviewStatus: "pending", updatedAt: new Date() })
        .where(eq(schemes.id, schemeId));
      await db.insert(verificationEvents).values({ schemeId, kind: "content_changed", detail: { source: opts.sourceId ?? null } });
    }
  }

  // Translations (non-English). Curated ones are still pending until reviewed.
  for (const [lang, t] of Object.entries(s.text)) {
    if (lang === "en" || !t) continue;
    await db
      .insert(schemeTranslations)
      .values({
        schemeId,
        lang,
        name: t.name,
        shortDescription: t.shortDescription,
        benefits: t.benefits,
        howToApplySteps: t.howToApplySteps,
        documentsRequired: t.documentsRequired,
        translatedBy: opts.generatedBy === "llm" ? "llm" : opts.generatedBy === "importer" ? "importer" : "curated",
        reviewStatus: "pending",
      })
      .onConflictDoUpdate({
        target: [schemeTranslations.schemeId, schemeTranslations.lang],
        set: {
          name: t.name,
          shortDescription: t.shortDescription,
          benefits: t.benefits,
          howToApplySteps: t.howToApplySteps,
          documentsRequired: t.documentsRequired,
          reviewStatus: sql`case when ${schemeTranslations.name} = ${t.name} and ${schemeTranslations.benefits} = ${t.benefits} then ${schemeTranslations.reviewStatus} else 'pending'::review_status end`,
          updatedAt: new Date(),
        },
      });
  }

  const ruleVersion = await addRuleVersion(db, schemeId, s.rule, opts);
  return { schemeId, created, changed, ruleVersion };
}

/** Adds a new pending rule version if it differs from the latest one. Returns the version or null if unchanged. */
export async function addRuleVersion(db: Db, schemeId: string, rule: RuleNode, opts: UpsertOptions): Promise<number | null> {
  const valid = parseRule(rule);
  const latest = await db.query.eligibilityRules.findFirst({
    where: eq(eligibilityRules.schemeId, schemeId),
    orderBy: desc(eligibilityRules.version),
  });
  if (latest && canonicalJson(latest.rule) === canonicalJson(valid)) return null;
  const version = (latest?.version ?? 0) + 1;
  await db.insert(eligibilityRules).values({
    schemeId,
    version,
    rule: valid,
    sourceText: opts.sourceText ?? null,
    generatedBy: opts.generatedBy,
    model: opts.model ?? null,
    reviewStatus: "pending",
  });
  return version;
}

export interface ReviewDecision {
  reviewer: string;
  notes?: string;
}

/** Approve a rule version. Approving also verifies the scheme (sets last_verified_at) if requested. */
export async function approveRule(db: Db, ruleId: string, d: ReviewDecision & { alsoApproveScheme?: boolean }) {
  const rule = await db.query.eligibilityRules.findFirst({ where: eq(eligibilityRules.id, ruleId) });
  if (!rule) throw new Error(`rule ${ruleId} not found`);
  parseRule(rule.rule); // never approve an invalid tree
  const now = new Date();
  await db
    .update(eligibilityRules)
    .set({ reviewStatus: "approved", reviewedBy: d.reviewer, reviewedAt: now, reviewNotes: d.notes ?? null })
    .where(eq(eligibilityRules.id, ruleId));
  if (d.alsoApproveScheme) await approveScheme(db, rule.schemeId, d);
  return { ruleId, schemeId: rule.schemeId };
}

export async function rejectRule(db: Db, ruleId: string, d: ReviewDecision) {
  await db
    .update(eligibilityRules)
    .set({ reviewStatus: "rejected", reviewedBy: d.reviewer, reviewedAt: new Date(), reviewNotes: d.notes ?? null })
    .where(eq(eligibilityRules.id, ruleId));
}

/** Approve scheme content + its translations, and stamp last_verified_at. */
export async function approveScheme(db: Db, schemeId: string, d: ReviewDecision & { translations?: boolean }) {
  const now = new Date();
  await db
    .update(schemes)
    .set({ reviewStatus: "approved", lastVerifiedAt: now, updatedAt: now })
    .where(eq(schemes.id, schemeId));
  if (d.translations !== false) {
    await db
      .update(schemeTranslations)
      .set({ reviewStatus: "approved" })
      .where(and(eq(schemeTranslations.schemeId, schemeId), eq(schemeTranslations.reviewStatus, "pending")));
  }
  await db.insert(verificationEvents).values({ schemeId, kind: "approved", detail: { reviewer: d.reviewer, notes: d.notes ?? null } });
}

export async function rejectScheme(db: Db, schemeId: string, d: ReviewDecision) {
  await db.update(schemes).set({ reviewStatus: "rejected", updatedAt: new Date() }).where(eq(schemes.id, schemeId));
  await db.insert(verificationEvents).values({ schemeId, kind: "rejected", detail: { reviewer: d.reviewer, notes: d.notes ?? null } });
}
