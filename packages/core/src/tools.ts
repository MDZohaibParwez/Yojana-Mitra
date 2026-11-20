import { z } from "zod";
import { evaluate, type EvaluationResult } from "./engine.js";
import { describeCheck, describeExpectation, describeMissing, fmt, formatValue, getLocale, LANGS, type Lang } from "./i18n/index.js";
import { mergeDocuments, type ChecklistItem } from "./documents.js";
import { assertNoSensitive, redact } from "./privacy.js";
import { ProfileSchema, type Profile, type ProfileField } from "./profile.js";
import { daysUntil, rankScore } from "./ranking.js";
import type { Channel, SchemeRepository } from "./repository.js";
import { schemeText, type SchemeRecord } from "./scheme.js";
import { STATE_CODES } from "./states.js";

export class ToolError extends Error {
  constructor(
    public code: "not_found" | "invalid_input" | "sensitive_data" | "internal",
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export interface ToolContext {
  repo: SchemeRepository;
  channel: Channel;
  now?: Date;
}

const LangSchema = z.enum(LANGS).describe("Reply language: en, hi, hinglish, gu, mr, ta, te, bn, kn");

/* ----------------------------- Input schemas ----------------------------- */

export const FindSchemesInput = z
  .object({
    profile: ProfileSchema.describe("What is known about the person. Omit unknown fields — never guess."),
    query: z.string().max(200).optional().describe("Optional free-text need, e.g. 'pension', 'house', 'scholarship'"),
    lang: LangSchema.optional(),
    limit: z.number().int().min(1).max(50).optional(),
    includeMaybe: z.boolean().optional().describe("Also return schemes that need more info (default true)"),
  })
  .strict();

export const GetSchemeInput = z
  .object({
    idOrSlug: z.string().min(1).max(120).describe("Scheme id or slug, e.g. 'pm-kisan'"),
    lang: LangSchema.optional(),
  })
  .strict();

export const CheckEligibilityInput = z
  .object({
    schemeId: z.string().min(1).max(120).describe("Scheme id or slug"),
    profile: ProfileSchema,
    lang: LangSchema.optional(),
  })
  .strict();

export const CompareSchemesInput = z
  .object({
    ids: z.array(z.string().min(1).max(120)).min(2).max(5).describe("2 to 5 scheme ids or slugs"),
    lang: LangSchema.optional(),
    profile: ProfileSchema.optional().describe("Optional: also show eligibility for this profile"),
  })
  .strict();

export const DocumentChecklistBase = z
  .object({
    profile: ProfileSchema.optional().describe("Use the schemes this profile is eligible for"),
    schemeIds: z.array(z.string().min(1).max(120)).max(20).optional().describe("Or: explicit scheme ids/slugs"),
    lang: LangSchema.optional(),
  })
  .strict();
export const DocumentChecklistInput = DocumentChecklistBase.refine((v) => v.profile || (v.schemeIds && v.schemeIds.length), { message: "Provide profile or schemeIds" });

export const UpcomingDeadlinesInput = z
  .object({
    state: z.enum(STATE_CODES).optional().describe("State/UT code; central schemes are always included"),
    days: z.number().int().min(1).max(365).optional().describe("Look-ahead window in days (default 30)"),
    lang: LangSchema.optional(),
  })
  .strict();

export const ReportIssueInput = z
  .object({
    schemeId: z.string().min(1).max(120),
    message: z.string().min(5).max(2000).describe("What is wrong. Do not include personal details."),
  })
  .strict();

/* ----------------------------- Output shapes ----------------------------- */

export interface Citation {
  sourceUrl: string;
  officialApplyUrl: string;
  lastVerifiedAt: string;
}

export interface SchemeSummary extends Citation {
  id: string;
  slug: string;
  name: string;
  level: SchemeRecord["level"];
  stateCode: string | null;
  ministry: string;
  category: string;
  shortDescription: string;
  deadline: string | null;
  status: SchemeRecord["status"];
}

export interface FindSchemesResultItem extends SchemeSummary {
  eligible: true | "maybe";
  reason: string;
  missing: ProfileField[];
  score: number;
}

/* ------------------------------ Helpers ---------------------------------- */

function cite(s: SchemeRecord): Citation {
  return { sourceUrl: s.sourceUrl, officialApplyUrl: s.officialApplyUrl, lastVerifiedAt: s.lastVerifiedAt };
}

function summarize(s: SchemeRecord, lang: Lang): SchemeSummary {
  const t = schemeText(s, lang);
  return {
    id: s.id,
    slug: s.slug,
    name: t.name,
    level: s.level,
    stateCode: s.stateCode,
    ministry: s.ministry,
    category: s.category,
    shortDescription: t.shortDescription,
    deadline: s.deadline,
    status: s.status,
    ...cite(s),
  };
}

function oneLineReason(r: EvaluationResult, lang: Lang): string {
  const L = getLocale(lang);
  if (r.eligible === true) {
    const top = r.passed
      .slice(0, 3)
      .map((c) => `${L.fields[c.field]}: ${c.negated ? describeExpectation(c, lang) : formatValue(c.field, c.actual, lang)}`);
    return top.length ? top.join("; ") : L.eligibleYes;
  }
  const need = r.missing.slice(0, 3).map((f) => L.fields[f]);
  return `${L.eligibleMaybe}: ${need.join(", ")}`;
}

async function requireScheme(ctx: ToolContext, idOrSlug: string): Promise<SchemeRecord> {
  const s = await ctx.repo.getScheme(idOrSlug.trim().toLowerCase());
  if (!s) {
    throw new ToolError(
      "not_found",
      `No verified scheme found for "${idOrSlug}". Use find_schemes to discover valid scheme ids/slugs. Yojana Mitra only answers from its reviewed database.`,
    );
  }
  return s;
}

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    throw new ToolError("invalid_input", `Invalid input — ${msg}`);
  }
  return r.data;
}

function guard(input: unknown) {
  try {
    assertNoSensitive(input);
  } catch (e) {
    throw new ToolError("sensitive_data", (e as Error).message);
  }
}

async function track(ctx: ToolContext, tool: string, state?: string | null, lang?: Lang, schemeIds?: string[]) {
  try {
    await ctx.repo.recordUsage({ channel: ctx.channel, tool, state: state ?? null, lang: lang ?? null, schemeIds });
  } catch {
    /* counters must never break a user request */
  }
}

const L10N = (lang: Lang) => {
  const L = getLocale(lang);
  return { disclaimer: L.disclaimer, freeServiceNote: L.freeServiceNote };
};

/* -------------------------------- Tools ---------------------------------- */

export async function findSchemes(ctx: ToolContext, rawInput: unknown) {
  guard(rawInput);
  const input = parse(FindSchemesInput, rawInput);
  const lang = input.lang ?? "en";
  const now = ctx.now ?? new Date();
  const profile: Profile = input.profile;
  const pool = await ctx.repo.listSchemes({ state: profile.state });

  let queryScores: Map<string, number> | null = null;
  if (input.query?.trim()) {
    const hits = await ctx.repo.search(input.query, { lang, limit: 100, state: profile.state });
    queryScores = new Map(hits.map((h) => [h.id, h.score]));
  }

  const includeMaybe = input.includeMaybe ?? true;
  const items: FindSchemesResultItem[] = [];
  const missingCount = new Map<ProfileField, number>();
  for (const s of pool) {
    if (queryScores && !queryScores.has(s.id)) continue;
    const r = evaluate(profile, s.rule);
    if (r.eligible === false) continue;
    if (r.eligible === "maybe") {
      r.missing.forEach((f) => missingCount.set(f, (missingCount.get(f) ?? 0) + 1));
      if (!includeMaybe) continue;
    }
    items.push({
      ...summarize(s, lang),
      eligible: r.eligible,
      reason: oneLineReason(r, lang),
      missing: r.missing,
      score: rankScore(s, r, now, queryScores?.get(s.id) ?? 0),
    });
  }
  items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const limit = input.limit ?? 20;
  const askNext = [...missingCount.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const L = getLocale(lang);
  await track(ctx, "find_schemes", profile.state, lang, items.slice(0, 5).map((i) => i.id));
  return {
    lang,
    totalEligible: items.filter((i) => i.eligible === true).length,
    totalMaybe: items.filter((i) => i.eligible === "maybe").length,
    results: items.slice(0, limit),
    askNext: askNext.slice(0, 5).map((field) => ({ field, question: L.questions[field] })),
    ...L10N(lang),
  };
}

export async function getScheme(ctx: ToolContext, rawInput: unknown) {
  const input = parse(GetSchemeInput, rawInput);
  const lang = input.lang ?? "en";
  const s = await requireScheme(ctx, input.idOrSlug);
  const t = schemeText(s, lang);
  await track(ctx, "get_scheme", s.stateCode, lang, [s.id]);
  return {
    ...summarize(s, lang),
    contentLang: t.lang,
    benefits: t.benefits,
    howToApplySteps: t.howToApplySteps,
    documentsRequired: t.documentsRequired,
    tags: s.tags,
    eligibilityRule: s.rule,
    ...L10N(lang),
  };
}

export async function checkEligibility(ctx: ToolContext, rawInput: unknown) {
  guard(rawInput);
  const input = parse(CheckEligibilityInput, rawInput);
  const lang = input.lang ?? "en";
  const L = getLocale(lang);
  const s = await requireScheme(ctx, input.schemeId);
  const r = evaluate(input.profile, s.rule);
  await track(ctx, "check_eligibility", input.profile.state ?? s.stateCode, lang, [s.id]);
  return {
    scheme: summarize(s, lang),
    eligible: r.eligible,
    verdict: r.eligible === true ? L.eligibleYes : r.eligible === false ? L.eligibleNo : L.eligibleMaybe,
    passed: r.passed.map((c) => describeCheck(c, "passed", lang)),
    failed: r.failed.map((c) => describeCheck(c, "failed", lang)),
    missing: r.missing.map((field) => ({ field, label: describeMissing(field, lang), question: L.questions[field] })),
    ...cite(s),
    ...L10N(lang),
  };
}

export async function compareSchemes(ctx: ToolContext, rawInput: unknown) {
  guard(rawInput);
  const input = parse(CompareSchemesInput, rawInput);
  const lang = input.lang ?? "en";
  const L = getLocale(lang);
  const now = ctx.now ?? new Date();
  const schemes = await Promise.all([...new Set(input.ids)].map((id) => requireScheme(ctx, id)));
  await track(ctx, "compare_schemes", input.profile?.state, lang);
  return {
    lang,
    schemes: schemes.map((s) => {
      const t = schemeText(s, lang);
      const r = input.profile ? evaluate(input.profile, s.rule) : null;
      return {
        ...summarize(s, lang),
        levelLabel: L.level[s.level],
        benefits: t.benefits,
        documentsRequired: t.documentsRequired,
        applySteps: t.howToApplySteps.length,
        daysToDeadline: daysUntil(s.deadline, now),
        eligibility: r
          ? {
              eligible: r.eligible,
              failed: r.failed.map((c) => describeCheck(c, "failed", lang)),
              missing: r.missing,
            }
          : null,
      };
    }),
    ...L10N(lang),
  };
}

export async function documentChecklist(ctx: ToolContext, rawInput: unknown) {
  guard(rawInput);
  const input = parse(DocumentChecklistInput, rawInput);
  const lang = input.lang ?? "en";
  let schemes: SchemeRecord[];
  if (input.schemeIds?.length) {
    schemes = await Promise.all([...new Set(input.schemeIds)].map((id) => requireScheme(ctx, id)));
  } else {
    const pool = await ctx.repo.listSchemes({ state: input.profile!.state });
    schemes = pool.filter((s) => evaluate(input.profile!, s.rule).eligible === true);
  }
  const items: ChecklistItem[] = mergeDocuments(
    schemes.map((s) => {
      const t = schemeText(s, lang);
      return { scheme: t.name, documents: t.documentsRequired };
    }),
  );
  await track(ctx, "document_checklist", input.profile?.state, lang);
  return {
    lang,
    schemes: schemes.map((s) => ({ id: s.id, slug: s.slug, name: schemeText(s, lang).name, ...cite(s) })),
    documents: items,
    note: "Never share document numbers (Aadhaar, PAN, bank) with anyone except the official office/portal.",
    ...L10N(lang),
  };
}

export async function upcomingDeadlines(ctx: ToolContext, rawInput: unknown) {
  const input = parse(UpcomingDeadlinesInput, rawInput ?? {});
  const lang = input.lang ?? "en";
  const days = input.days ?? 30;
  const now = ctx.now ?? new Date();
  const pool = await ctx.repo.listSchemes({ state: input.state });
  const results = pool
    .map((s) => ({ s, d: daysUntil(s.deadline, now) }))
    .filter((x): x is { s: SchemeRecord; d: number } => x.d !== null && x.d >= 0 && x.d <= days)
    .sort((a, b) => a.d - b.d)
    .map(({ s, d }) => ({ ...summarize(s, lang), daysLeft: d }));
  await track(ctx, "upcoming_deadlines", input.state, lang);
  const L = getLocale(lang);
  return {
    lang,
    days,
    header: fmt(results.length ? L.deadlinesHeader : L.noDeadlines, { days }),
    results,
    ...L10N(lang),
  };
}

export async function reportIssue(ctx: ToolContext, rawInput: unknown) {
  guard(rawInput);
  const input = parse(ReportIssueInput, rawInput);
  const s = await requireScheme(ctx, input.schemeId);
  const { id } = await ctx.repo.createReport({ schemeId: s.id, message: redact(input.message), channel: ctx.channel });
  await track(ctx, "report_issue", s.stateCode);
  return {
    reportId: id,
    schemeId: s.id,
    status: "open" as const,
    message: "Thank you. The report was recorded and will be reviewed by the Yojana Mitra team.",
  };
}

export const TOOLS = {
  find_schemes: findSchemes,
  get_scheme: getScheme,
  check_eligibility: checkEligibility,
  compare_schemes: compareSchemes,
  document_checklist: documentChecklist,
  upcoming_deadlines: upcomingDeadlines,
  report_issue: reportIssue,
} as const;
export type ToolName = keyof typeof TOOLS;
