import { z } from "zod";
import { LANGS } from "./i18n/lang.js";
import { RuleNodeSchema } from "./rules.js";
import { SCHEME_CATEGORIES, type SchemeRecord } from "./scheme.js";
import { STATE_CODES } from "./states.js";

export const SchemeTextSchema = z
  .object({
    name: z.string().min(2).max(300),
    shortDescription: z.string().min(10).max(1000),
    benefits: z.string().min(5).max(3000),
    howToApplySteps: z.array(z.string().min(3).max(1000)).min(1).max(20),
    documentsRequired: z.array(z.string().min(2).max(300)).max(30),
  })
  .strict();

const url = z
  .string()
  .url()
  .refine((u) => u.startsWith("https://"), "must be https");

/** Normalised scheme as produced by importers and curated seed files. */
export const SeedSchemeSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120),
    level: z.enum(["central", "state"]),
    stateCode: z.enum(STATE_CODES).nullable(),
    ministry: z.string().min(2).max(300),
    category: z.enum(SCHEME_CATEGORIES),
    tags: z.array(z.string().max(60)).max(30),
    officialApplyUrl: url,
    sourceUrl: url,
    status: z.enum(["active", "closed", "unknown"]),
    deadline: z.string().date().nullable(),
    benefitValueInr: z.number().nonnegative().nullable(),
    text: z.partialRecord(z.enum(LANGS), SchemeTextSchema).refine((t) => !!t.en, "text.en is required"),
    rule: RuleNodeSchema,
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.level === "state" && !s.stateCode) ctx.addIssue({ code: "custom", message: "state schemes need stateCode" });
    if (s.level === "central" && s.stateCode) ctx.addIssue({ code: "custom", message: "central schemes must not have stateCode" });
  });

export type SeedScheme = z.infer<typeof SeedSchemeSchema>;

export function seedToRecord(s: SeedScheme, opts: { id?: string; lastVerifiedAt: string }): SchemeRecord {
  return {
    id: opts.id ?? s.slug,
    slug: s.slug,
    level: s.level,
    stateCode: s.stateCode,
    ministry: s.ministry,
    category: s.category,
    tags: s.tags,
    officialApplyUrl: s.officialApplyUrl,
    sourceUrl: s.sourceUrl,
    lastVerifiedAt: opts.lastVerifiedAt,
    status: s.status,
    deadline: s.deadline,
    benefitValueInr: s.benefitValueInr,
    text: s.text as SchemeRecord["text"],
    rule: s.rule,
  };
}
