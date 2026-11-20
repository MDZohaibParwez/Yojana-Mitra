import type { RuleNode } from "./rules.js";
import type { Lang } from "./i18n/lang.js";

export type SchemeLevel = "central" | "state";
export type SchemeStatus = "active" | "closed" | "unknown";
export type ReviewStatus = "pending" | "approved" | "rejected";

export const SCHEME_CATEGORIES = [
  "agriculture",
  "health",
  "housing",
  "education",
  "pension",
  "insurance",
  "employment",
  "business",
  "women_child",
  "social_welfare",
  "disability",
  "skill",
  "energy",
  "food",
  "banking",
] as const;
export type SchemeCategory = (typeof SCHEME_CATEGORIES)[number];

/** Translatable text content of a scheme. */
export interface SchemeText {
  name: string;
  shortDescription: string;
  benefits: string;
  howToApplySteps: string[];
  documentsRequired: string[];
}

/** A scheme as the core layer sees it: approved content + approved rule only. */
export interface SchemeRecord {
  id: string;
  slug: string;
  level: SchemeLevel;
  stateCode: string | null;
  ministry: string;
  category: SchemeCategory;
  tags: string[];
  officialApplyUrl: string;
  sourceUrl: string;
  lastVerifiedAt: string; // ISO date
  status: SchemeStatus;
  deadline: string | null; // ISO date
  /** Rough annual benefit value in INR, used only for ranking. */
  benefitValueInr: number | null;
  /** Content by language. `en` is always present. */
  text: Partial<Record<Lang, SchemeText>> & { en: SchemeText };
  rule: RuleNode;
}

export function schemeText(s: SchemeRecord, lang: Lang): SchemeText & { lang: Lang } {
  const t = s.text[lang];
  if (t) return { ...t, lang };
  // Marathi readers read Devanagari comfortably; everyone else falls back to English.
  if (lang === "mr" && s.text.hi) return { ...s.text.hi, lang: "hi" };
  return { ...s.text.en, lang: "en" };
}
